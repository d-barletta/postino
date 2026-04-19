#!/usr/bin/env npx tsx --env-file .env.local
/**
 * Debug script to run the sandbox agent locally with full OpenCode artifacts.
 *
 * Usage:
 *   npm run debug:sandbox -- --log-id <email_log_id>
 *   npm run debug:sandbox
 *   npm run debug:sandbox -- --html-file ./tmp/email.html --subject "Hello" --from test@example.com
 *   npm run debug:sandbox -- --log-id <email_log_id> --html-file ./tmp/email.html
 *   npm run debug:sandbox -- --html-file ./tmp/email.html --user-id <user_id>
 *   npm run debug:sandbox -- --html-file ./tmp/email.html --rules-file ./tmp/rules.json
 *   npm run debug:sandbox -- --html-file ./tmp/email.html --rule "Translate to Italian"
 *   npm run debug:sandbox -- --model qwen/qwen3-coder-480b-a35b-instruct:free
 *   npm run debug:sandbox -- --html-file ./tmp/email.html --model openai/gpt-4o
 *
 * When `--html-file` is provided, the script writes artifacts next to that file:
 *   - <name>.rewritten.html
 *   - <name>.subject.txt
 *   - <name>.usage.json
 *   - <name>.session.json
 *   - <name>.prompt.txt
 *   - <name>.stdout.log
 *   - <name>.stderr.log
 */

import { Sandbox } from '@vercel/sandbox';
import { createClient } from '@supabase/supabase-js';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import nodePath from 'node:path';
import { buildMemoryContext, getUserMemory } from '../src/agents/sandbox-email-agent';
import { buildSandboxEmailAgentPrompt } from '../src/agents/sandbox-email-agent-prompt-builder';
import {
  createSandboxMemoryToolToken,
  resolveSandboxMemoryToolBaseUrl,
} from '../src/lib/sandbox-memory-tool';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openRouterKey = process.env.OPEN_ROUTER_API_KEY || process.env.OPENROUTER_API_KEY || '';

type DebugRule = {
  id: string;
  name: string;
  text: string;
};

function getArgValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function getArgValues(flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
    }
  }
  return values;
}

function buildPrompt(
  emailFrom: string,
  emailSubject: string,
  rules: DebugRule[],
  memorySection = '',
  attachmentNames?: string[],
  memoryToolEnabled = false,
): string {
  return buildSandboxEmailAgentPrompt({
    emailFrom,
    emailSubject,
    rules,
    memorySection,
    attachmentNames,
    memoryToolEnabled,
  });
}

function canSandboxReachBaseUrl(baseUrl: string): boolean {
  if (!baseUrl) return false;

  try {
    const url = new URL(baseUrl);
    const hostname = url.hostname.toLowerCase();
    return !(
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}

function parseOpencodeSessionId(stdout: string): string | null {
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const event = JSON.parse(trimmed) as Record<string, unknown>;
      const candidates = [
        event.sessionID,
        event.sessionId,
        (event.session as Record<string, unknown> | undefined)?.id,
        (event.session as Record<string, unknown> | undefined)?.sessionID,
        (event.info as Record<string, unknown> | undefined)?.sessionID,
        (event.info as Record<string, unknown> | undefined)?.id,
      ];

      for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.startsWith('ses_')) {
          return candidate;
        }
      }
    } catch {
      // Ignore non-JSON lines.
    }
  }

  return null;
}

function parseHumanReadableOpencodeNumber(value: string): number | null {
  const normalized = value.replace(/,/g, '').trim();
  const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)([KMB])?$/i);
  if (!match) return null;

  const base = Number.parseFloat(match[1]);
  if (!Number.isFinite(base)) return null;

  const suffix = match[2]?.toUpperCase();
  const multiplier =
    suffix === 'K' ? 1_000 : suffix === 'M' ? 1_000_000 : suffix === 'B' ? 1_000_000_000 : 1;
  return Math.round(base * multiplier);
}

function parseOpencodeStatsOutput(text: string): {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  promptTokens: number;
  completionTokens: number;
} | null {
  const extractMetric = (label: string): number | null => {
    const regex = new RegExp(`[|│]\\s*${label.replace(/ /g, '\\s+')}\\s+([^\\s|│]+)\\s*[|│]`, 'i');
    const match = text.match(regex);
    return match ? parseHumanReadableOpencodeNumber(match[1]) : null;
  };

  const inputTokens = extractMetric('Input');
  const outputTokens = extractMetric('Output');
  const cacheReadTokens = extractMetric('Cache Read') ?? 0;
  const cacheWriteTokens = extractMetric('Cache Write') ?? 0;

  if (
    inputTokens === null &&
    outputTokens === null &&
    cacheReadTokens === 0 &&
    cacheWriteTokens === 0
  ) {
    return null;
  }

  const promptBase = inputTokens ?? 0;
  const completionTokens = outputTokens ?? 0;

  return {
    inputTokens: promptBase,
    outputTokens: completionTokens,
    cacheReadTokens,
    cacheWriteTokens,
    promptTokens: promptBase + cacheReadTokens + cacheWriteTokens,
    completionTokens,
  };
}

function readOpencodeTokenPair(
  value: unknown,
): { promptTokens: number; completionTokens: number; totalTokens: number } | null {
  if (!value || typeof value !== 'object') return null;

  const tokens = value as Record<string, unknown>;
  const cache =
    tokens.cache && typeof tokens.cache === 'object'
      ? (tokens.cache as Record<string, unknown>)
      : null;

  const promptCandidates = [
    tokens.input,
    tokens.inputTokens,
    tokens.tokensIn,
    tokens.tokens_in,
    tokens.prompt_tokens,
    tokens.promptTokens,
  ];
  const completionCandidates = [
    tokens.output,
    tokens.outputTokens,
    tokens.tokensOut,
    tokens.tokens_out,
    tokens.completion_tokens,
    tokens.completionTokens,
  ];
  const totalCandidates = [tokens.total, tokens.totalTokens, tokens.total_tokens];

  const cacheWriteCandidates = [
    cache?.write,
    cache?.write_tokens,
    cache?.writeTokens,
    tokens.cache_write,
    tokens.cacheWrite,
    tokens.cached_input_tokens,
    tokens.cachedInputTokens,
  ];
  const cacheReadCandidates = [
    cache?.read,
    cache?.read_tokens,
    cache?.readTokens,
    tokens.cache_read,
    tokens.cacheRead,
  ];

  const promptTokens = promptCandidates.find((candidate) => typeof candidate === 'number');
  const completionTokens = completionCandidates.find((candidate) => typeof candidate === 'number');
  const totalTokens = totalCandidates.find((candidate) => typeof candidate === 'number');
  const cacheWriteTokens = cacheWriteCandidates.find((candidate) => typeof candidate === 'number');
  const cacheReadTokens = cacheReadCandidates.find((candidate) => typeof candidate === 'number');
  if (
    typeof promptTokens !== 'number' &&
    typeof completionTokens !== 'number' &&
    typeof cacheWriteTokens !== 'number' &&
    typeof cacheReadTokens !== 'number'
  ) {
    return null;
  }

  const promptBase = typeof promptTokens === 'number' ? promptTokens : 0;
  const cacheWrite = typeof cacheWriteTokens === 'number' ? cacheWriteTokens : 0;
  const cacheRead = typeof cacheReadTokens === 'number' ? cacheReadTokens : 0;
  const completion = typeof completionTokens === 'number' ? completionTokens : 0;
  const total =
    typeof totalTokens === 'number'
      ? totalTokens
      : promptBase + cacheWrite + cacheRead + completion;

  return {
    // OpenCode export can move most prompt usage into cache write/read fields.
    promptTokens: promptBase + cacheWrite + cacheRead,
    completionTokens: completion,
    totalTokens: total,
  };
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) return null;

  const candidate = text.slice(firstBrace).trim();
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractUsageFromOpencodeExport(sessionData: Record<string, unknown>): {
  sessionId: string | null;
  promptTokens: number;
  completionTokens: number;
} {
  const sessionInfo = sessionData.info as Record<string, unknown> | undefined;
  const sessionId =
    typeof sessionInfo?.id === 'string' && sessionInfo.id.startsWith('ses_')
      ? sessionInfo.id
      : null;

  const topLevelTokens =
    readOpencodeTokenPair(sessionData.tokens) ??
    readOpencodeTokenPair(sessionInfo?.tokens) ??
    readOpencodeTokenPair(sessionData.usage) ??
    readOpencodeTokenPair(sessionData.stats);
  if (topLevelTokens) {
    return { sessionId, ...topLevelTokens };
  }

  let promptTokens = 0;
  let completionTokens = 0;
  const usageRecords: Array<{
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }> = [];
  const messages = sessionData.messages as Array<Record<string, unknown>> | undefined;

  if (Array.isArray(messages)) {
    for (const message of messages) {
      const messageInfo = message.info as Record<string, unknown> | undefined;
      const messageTokens =
        readOpencodeTokenPair(messageInfo?.tokens) ??
        readOpencodeTokenPair(message.tokens) ??
        readOpencodeTokenPair(message.usage);

      if (messageTokens) {
        usageRecords.push(messageTokens);
        continue;
      }

      const parts = message.parts as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(parts)) continue;

      for (const part of parts) {
        const partTokens = readOpencodeTokenPair(part.tokens) ?? readOpencodeTokenPair(part.usage);
        if (!partTokens) continue;
        usageRecords.push(partTokens);
      }
    }
  }

  const recordsWithTotal = usageRecords.filter((record) => record.totalTokens > 0);

  if (recordsWithTotal.length > 0) {
    const best = recordsWithTotal.reduce((maxRecord, record) =>
      record.totalTokens > maxRecord.totalTokens ? record : maxRecord,
    );
    return {
      sessionId,
      promptTokens: best.promptTokens,
      completionTokens: best.completionTokens,
    };
  }

  for (const record of usageRecords) {
    promptTokens += record.promptTokens;
    completionTokens += record.completionTokens;
  }

  return { sessionId, promptTokens, completionTokens };
}

async function loadRulesFromFile(rulesFile: string): Promise<DebugRule[]> {
  const content = await readFile(rulesFile, 'utf-8');
  if (rulesFile.endsWith('.json')) {
    const parsed = JSON.parse(content) as Array<
      string | { id?: string; name?: string; text?: string }
    >;
    return parsed
      .map((entry, index) => {
        if (typeof entry === 'string') {
          return { id: `rule-${index + 1}`, name: `Rule ${index + 1}`, text: entry };
        }
        const text = entry.text?.trim() ?? '';
        if (!text) return null;
        return {
          id: entry.id?.trim() || `rule-${index + 1}`,
          name: entry.name?.trim() || `Rule ${index + 1}`,
          text,
        };
      })
      .filter((entry): entry is DebugRule => Boolean(entry));
  }

  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((text, index) => ({ id: `rule-${index + 1}`, name: `Rule ${index + 1}`, text }));
}

async function readOptionalTextFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

async function readAgentsFolder(
  dirPath: string,
  baseDir?: string,
): Promise<{ relativePath: string; content: Buffer }[]> {
  const base = baseDir ?? dirPath;
  const results: { relativePath: string; content: Buffer }[] = [];
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = nodePath.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const sub = await readAgentsFolder(fullPath, base);
        results.push(...sub);
      } else if (entry.isFile()) {
        const content = await readFile(fullPath);
        const relativePath = nodePath.relative(base, fullPath);
        results.push({ relativePath, content });
      }
    }
  } catch {
    // Folder doesn't exist — return empty.
  }
  return results;
}

async function main() {
  const logIdArg = getArgValue('--log-id');
  const htmlFileArg = getArgValue('--html-file');
  const subjectArg = getArgValue('--subject');
  const fromArg = getArgValue('--from');
  const userIdArg = getArgValue('--user-id');
  const rulesFileArg = getArgValue('--rules-file');
  const directRuleArgs = getArgValues('--rule');
  const modelArg = getArgValue('--model');
  const defaultRulesFilePath = nodePath.join(process.cwd(), 'scripts', 'rules.json');

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Load global settings
  const { data: settingsRow } = await supabase
    .from('settings')
    .select('data')
    .eq('id', 'global')
    .single();
  const settings = (settingsRow?.data as Record<string, unknown>) ?? {};

  const snapshotId =
    (settings.opencodeSandboxSnapshotId as string) ||
    process.env.OPENCODE_SANDBOX_SNAPSHOT_ID ||
    '';
  const model =
    modelArg ||
    process.env.LLM_MODEL ||
    (settings.llmModel as string) ||
    'google/gemini-3-flash-preview';

  if (!snapshotId) {
    console.error('No snapshot ID found in settings or env');
    process.exit(1);
  }
  if (!openRouterKey) {
    console.error('No OpenRouter API key found in env');
    process.exit(1);
  }

  let logRow: {
    user_id: string | null;
    from_address: string | null;
    subject: string | null;
    original_body: string | null;
  } | null = null;

  if (logIdArg) {
    const { data } = await supabase
      .from('email_logs')
      .select('user_id, from_address, subject, original_body')
      .eq('id', logIdArg)
      .single();
    logRow = data;

    if (!logRow) {
      console.error(`Email log ${logIdArg} not found`);
      process.exit(1);
    }
  }

  const defaultHtmlFilePath = nodePath.join(process.cwd(), 'scripts', 'original.html');
  const htmlFilePath = nodePath.resolve(htmlFileArg ?? defaultHtmlFilePath);
  const artifactDir = nodePath.dirname(htmlFilePath);
  const artifactBaseName = nodePath.basename(htmlFilePath, nodePath.extname(htmlFilePath));

  const emailBody =
    htmlFileArg || !logRow
      ? await readFile(htmlFilePath, 'utf-8')
      : ((logRow?.original_body as string | null) ?? '');
  const siblingSubject = await readOptionalTextFile(
    nodePath.join(artifactDir, `${artifactBaseName}.subject.txt`),
  );
  const resolvedSubject = subjectArg ?? logRow?.subject ?? siblingSubject?.trim() ?? '';
  const emailSubject = resolvedSubject.length > 0 ? resolvedSubject : artifactBaseName;
  const emailFrom = fromArg ?? logRow?.from_address ?? 'unknown@example.com';
  const userId = userIdArg ?? logRow?.user_id ?? null;
  let userEmail = '';

  if (userId) {
    const { data: userRow } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single();
    userEmail = typeof userRow?.email === 'string' ? userRow.email.trim() : '';
  }

  let rules: DebugRule[] = [];
  if (userId) {
    const { data: rulesRows } = await supabase
      .from('rules')
      .select('id, name, text')
      .eq('user_id', userId)
      .eq('is_active', true);
    const rows = (rulesRows ?? []) as Array<{ id: string; name: string | null; text: string }>;
    rules = rows.map((row) => ({
      id: row.id,
      name: row.name || row.id,
      text: row.text,
    }));
  } else if (rulesFileArg) {
    rules = await loadRulesFromFile(nodePath.resolve(rulesFileArg));
  } else if (directRuleArgs.length > 0) {
    rules = directRuleArgs.map((text, index) => ({
      id: `rule-${index + 1}`,
      name: `Rule ${index + 1}`,
      text,
    }));
  } else {
    rules = await loadRulesFromFile(defaultRulesFilePath);
  }

  const sandboxMemoryToolBaseUrl = resolveSandboxMemoryToolBaseUrl();
  const sandboxCanReachBaseUrl = canSandboxReachBaseUrl(sandboxMemoryToolBaseUrl);
  const sandboxMemoryToolToken =
    userId && sandboxCanReachBaseUrl
      ? createSandboxMemoryToolToken({
          userId,
          logId: logIdArg ?? `debug-${Date.now()}`,
          userEmail,
        })
      : null;
  const memoryToolEnabled = Boolean(sandboxCanReachBaseUrl && sandboxMemoryToolToken);

  let memorySection = '';
  if (!memoryToolEnabled && userId) {
    const memory = await getUserMemory(userId).catch(() => ({
      userId,
      entries: [],
      updatedAt: new Date(),
    }));
    const memoryContext = buildMemoryContext(memory.entries, emailFrom);
    memorySection = memoryContext ? `\n\n<email_history>\n${memoryContext}\n</email_history>` : '';
  }

  const prompt = buildPrompt(
    emailFrom,
    emailSubject,
    rules,
    memorySection,
    undefined,
    memoryToolEnabled,
  );

  await mkdir(artifactDir, { recursive: true });

  const promptPath = nodePath.join(artifactDir, `${artifactBaseName}.prompt.txt`);
  const rewrittenHtmlPath = nodePath.join(artifactDir, `${artifactBaseName}.rewritten.html`);
  const rewrittenSubjectPath = nodePath.join(artifactDir, `${artifactBaseName}.subject.txt`);
  const usagePath = nodePath.join(artifactDir, `${artifactBaseName}.usage.json`);
  const statsPath = nodePath.join(artifactDir, `${artifactBaseName}.stats.txt`);
  const sessionPath = nodePath.join(artifactDir, `${artifactBaseName}.session.json`);
  const stdoutPath = nodePath.join(artifactDir, `${artifactBaseName}.stdout.log`);
  const stderrPath = nodePath.join(artifactDir, `${artifactBaseName}.stderr.log`);

  await writeFile(promptPath, prompt, 'utf-8');

  console.log('━'.repeat(60));
  console.log('📧 Email from:', emailFrom);
  console.log('📧 Subject:', emailSubject);
  console.log('📧 Body length:', emailBody.length, 'chars');
  console.log('📄 Source HTML:', htmlFilePath);
  console.log('📋 Rules:', rules.length);
  console.log('🤖 Model:', model);
  console.log('📦 Snapshot:', snapshotId);
  console.log(
    '🧠 Memory mode:',
    memoryToolEnabled
      ? `tool (${sandboxMemoryToolBaseUrl})`
      : memorySection
        ? 'inline fallback'
        : 'disabled',
  );
  if (!sandboxCanReachBaseUrl && sandboxMemoryToolBaseUrl) {
    console.log(
      '⚠️  Memory tool disabled because sandbox cannot reach local/private base URL:',
      sandboxMemoryToolBaseUrl,
    );
  }
  console.log('📁 Artifact dir:', artifactDir);
  console.log('━'.repeat(60));

  console.log('\n📝 FULL PROMPT SENT TO OPENCODE:');
  console.log('┌' + '─'.repeat(58) + '┐');
  console.log(prompt);
  console.log('└' + '─'.repeat(58) + '┘\n');

  console.log('\n🚀 Creating sandbox...');
  const sandbox = await Sandbox.create({
    source: { type: 'snapshot', snapshotId },
    timeout: 15 * 60 * 1000,
    env: {
      OPENROUTER_API_KEY: openRouterKey,
      POSTINO_INTERNAL_BASE_URL: memoryToolEnabled ? sandboxMemoryToolBaseUrl : '',
      POSTINO_MEMORY_TOOL_TOKEN: memoryToolEnabled ? (sandboxMemoryToolToken ?? '') : '',
    },
  });
  console.log('✅ Sandbox ID:', sandbox.sandboxId);

  // Write files
  const opencodeModelId = `openrouter/${model}`;
  const opencodeConfig = JSON.stringify(
    {
      $schema: 'https://opencode.ai/config.json',
      model: opencodeModelId,
      small_model: opencodeModelId,
      provider: {
        openrouter: {
          models: { [model]: {} },
        },
      },
    },
    null,
    2,
  );

  const authJson = JSON.stringify({ openrouter: { apiKey: openRouterKey } });

  await sandbox.writeFiles([
    { path: '/vercel/sandbox/email.html', content: Buffer.from(emailBody, 'utf-8') },
    { path: '/vercel/sandbox/prompt.txt', content: Buffer.from(prompt, 'utf-8') },
    { path: '/vercel/sandbox/opencode.json', content: Buffer.from(opencodeConfig, 'utf-8') },
    {
      path: '/vercel/sandbox/.local/share/opencode/auth.json',
      content: Buffer.from(authJson, 'utf-8'),
    },
  ]);

  // Sync the .agents folder (AGENTS.md, skills, custom agents) into the sandbox.
  const agentsDir = nodePath.join(process.cwd(), 'src', 'agents', '.agents');
  const agentFiles = await readAgentsFolder(agentsDir);
  if (agentFiles.length > 0) {
    await sandbox.writeFiles(
      agentFiles.map((f) => ({
        path: `/vercel/sandbox/${f.relativePath}`,
        content: f.content,
      })),
    );
    console.log(`✅ Synced ${agentFiles.length} file(s) from .agents:`);
    agentFiles.forEach((f) => console.log(`   ${f.relativePath}`));
  } else {
    console.log('⚠️  No files found in src/agents/.agents/');
  }
  console.log('');

  console.log('━'.repeat(60));
  console.log('🔧 Running: opencode run --format json --model ' + opencodeModelId);
  console.log('━'.repeat(60));
  console.log('');

  const liveLogPath = '/vercel/sandbox/opencode-live.log';
  let streamedStdout = '';
  let streamedLength = 0;
  let pollingLiveOutput = false;

  const flushLiveOutput = async (): Promise<void> => {
    if (pollingLiveOutput) return;
    pollingLiveOutput = true;
    try {
      const liveBuf = await sandbox.readFileToBuffer({ path: liveLogPath });
      if (!liveBuf) return;

      const liveText = liveBuf.toString('utf-8');
      if (liveText.length <= streamedLength) return;

      const chunk = liveText.slice(streamedLength);
      streamedLength = liveText.length;
      streamedStdout += chunk;
      process.stdout.write(chunk);
    } catch {
      // Ignore transient read errors while the file is being written.
    } finally {
      pollingLiveOutput = false;
    }
  };

  const command = await sandbox.runCommand({
    cmd: 'bash',
    args: [
      '-lc',
      `set -o pipefail; opencode run --format json --model "$OPENCODE_MODEL" "$(cat /vercel/sandbox/prompt.txt)" 2>&1 | tee ${liveLogPath}`,
    ],
    cwd: '/vercel/sandbox',
    env: {
      HOME: '/vercel/sandbox',
      XDG_DATA_HOME: '/vercel/sandbox/.local/share',
      OPENROUTER_API_KEY: openRouterKey,
      OPENCODE_MODEL: opencodeModelId,
      POSTINO_INTERNAL_BASE_URL: memoryToolEnabled ? sandboxMemoryToolBaseUrl : '',
      POSTINO_MEMORY_TOOL_TOKEN: memoryToolEnabled ? (sandboxMemoryToolToken ?? '') : '',
    },
    detached: true,
  });

  console.log('📡 Streaming OpenCode output...');
  const pollTimer = setInterval(() => {
    void flushLiveOutput();
  }, 1000);

  const result = await command.wait();
  clearInterval(pollTimer);
  await flushLiveOutput();

  const capturedStdout = await result.stdout();
  const stderr = await result.stderr();
  const stdout = capturedStdout.trim().length > 0 ? capturedStdout : streamedStdout;

  await writeFile(stdoutPath, stdout, 'utf-8');
  await writeFile(stderrPath, stderr, 'utf-8');

  const printOutputPreview = (
    label: string,
    content: string,
    options?: { headLines?: number; tailLines?: number },
  ): void => {
    const headLines = options?.headLines ?? 30;
    const tailLines = options?.tailLines ?? 80;

    if (!content.trim()) {
      console.log(`\n${label}: <empty>`);
      return;
    }

    const lines = content.split('\n');
    const total = lines.length;

    console.log(`\n${label}: ${total} line(s)`);

    if (total <= headLines + tailLines + 1) {
      console.log(content);
      return;
    }

    const head = lines.slice(0, headLines).join('\n');
    const tail = lines.slice(Math.max(total - tailLines, 0)).join('\n');

    console.log(`--- start (${headLines} lines) ---`);
    console.log(head);
    console.log(`--- middle omitted (${total - headLines - tailLines} lines) ---`);
    console.log(`--- end (${tailLines} lines) ---`);
    console.log(tail);
  };

  console.log('🪵 OpenCode stdout saved to:', stdoutPath);
  console.log('🪵 OpenCode stderr saved to:', stderrPath);
  printOutputPreview('📤 OpenCode stdout', stdout);
  printOutputPreview('📥 OpenCode stderr', stderr, { headLines: 20, tailLines: 40 });

  console.log('\n' + '━'.repeat(60));
  console.log('Exit code:', result.exitCode);

  let opencodeSessionId = parseOpencodeSessionId(stdout);
  let promptTokens = 0;
  let completionTokens = 0;
  let statsRaw = '';
  let statsParsed: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    promptTokens: number;
    completionTokens: number;
  } | null = null;
  let exportedSessionData: Record<string, unknown> | null = null;

  if (result.exitCode === 0) {
    const statsCommand = await sandbox.runCommand({
      cmd: 'opencode',
      args: ['stats'],
      cwd: '/vercel/sandbox',
      env: {
        HOME: '/vercel/sandbox',
        XDG_DATA_HOME: '/vercel/sandbox/.local/share',
        OPENROUTER_API_KEY: openRouterKey,
      },
    });
    const statsResult = await statsCommand.wait();
    statsRaw = await statsResult.stdout();
    statsParsed = parseOpencodeStatsOutput(statsRaw);
    await writeFile(statsPath, statsRaw, 'utf-8');

    if (statsParsed) {
      promptTokens = statsParsed.promptTokens;
      completionTokens = statsParsed.completionTokens;
    }
  }

  if (result.exitCode === 0 && opencodeSessionId) {
    const exportCommand = await sandbox.runCommand({
      cmd: 'opencode',
      args: ['export', opencodeSessionId],
      cwd: '/vercel/sandbox',
      env: {
        HOME: '/vercel/sandbox',
        XDG_DATA_HOME: '/vercel/sandbox/.local/share',
        OPENROUTER_API_KEY: openRouterKey,
      },
    });
    const exportResult = await exportCommand.wait();
    const exportOut = await exportResult.stdout();
    const parsedSession = extractJsonObject(exportOut);
    if (parsedSession) {
      exportedSessionData = parsedSession;
      if (!statsParsed) {
        const usage = extractUsageFromOpencodeExport(parsedSession);
        promptTokens = usage.promptTokens;
        completionTokens = usage.completionTokens;
        opencodeSessionId = usage.sessionId ?? opencodeSessionId;
      }
      await writeFile(sessionPath, JSON.stringify(parsedSession, null, 2), 'utf-8');
    } else {
      await writeFile(sessionPath, exportOut, 'utf-8');
    }
  }

  // Read results
  const htmlBuf = await sandbox.readFileToBuffer({ path: '/vercel/sandbox/email.html' });
  const subjBuf = await sandbox.readFileToBuffer({ path: '/vercel/sandbox/subject.txt' });

  if (htmlBuf) {
    const html = htmlBuf.toString('utf-8');
    await writeFile(rewrittenHtmlPath, html, 'utf-8');
    console.log('📄 Processed HTML length:', html.length, 'chars');
    const changed = html !== emailBody;
    console.log('📄 HTML changed:', changed);
    console.log('📄 Rewritten HTML saved to:', rewrittenHtmlPath);
    if (changed) {
      console.log('📄 First 500 chars of processed HTML:');
      console.log(html.slice(0, 500));
    }
  } else {
    console.log('⚠️  No processed HTML found');
  }

  if (subjBuf) {
    const subject = subjBuf.toString('utf-8').trim();
    await writeFile(rewrittenSubjectPath, `${subject}\n`, 'utf-8');
    console.log('📄 Processed subject:', subject);
    console.log('📄 Subject saved to:', rewrittenSubjectPath);
  } else {
    console.log('⚠️  No subject.txt found');
  }

  const usageData = {
    source: {
      logId: logIdArg ?? null,
      htmlFile: htmlFilePath,
      artifactDir,
    },
    sandbox: {
      sandboxId: sandbox.sandboxId,
      snapshotId,
    },
    memory: {
      mode: memoryToolEnabled ? 'tool' : memorySection ? 'inline-fallback' : 'disabled',
      baseUrl: memoryToolEnabled ? sandboxMemoryToolBaseUrl : null,
      hasToken: memoryToolEnabled,
      inlineContextIncluded: Boolean(memorySection),
      userId,
    },
    opencode: {
      sessionId: opencodeSessionId,
      model,
      exitCode: result.exitCode,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      statsRaw,
      statsParsed,
      exportedSessionWritten: Boolean(exportedSessionData),
    },
    email: {
      from: emailFrom,
      subject: emailSubject,
      originalBodyLength: emailBody.length,
      rewrittenHtmlPath,
      rewrittenSubjectPath,
    },
    rules,
    artifacts: {
      promptPath,
      stdoutPath,
      stderrPath,
      usagePath,
      statsPath,
      sessionPath,
    },
  };
  await writeFile(usagePath, JSON.stringify(usageData, null, 2), 'utf-8');
  console.log('📊 Usage saved to:', usagePath);
  console.log('📊 Stats saved to:', statsPath);
  if (opencodeSessionId) {
    console.log('🆔 OpenCode session ID:', opencodeSessionId);
  }
  console.log('🧮 Prompt tokens:', promptTokens);
  console.log('🧮 Completion tokens:', completionTokens);

  console.log('\n🧹 Stopping sandbox...');
  await sandbox.stop({ blocking: true });
  console.log('✅ Done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
