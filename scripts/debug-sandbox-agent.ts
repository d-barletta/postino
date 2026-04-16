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
  attachmentNames?: string[],
): string {
  const rulesText =
    rules.length > 0
      ? rules.map((rule) => `Rule "${rule.name}": ${rule.text}`).join('\n')
      : 'No specific rules. Preserve the original email content and subject unless a minimal, non-destructive cleanup is clearly needed.';

  const attachmentsLine =
    attachmentNames && attachmentNames.length > 0
      ? `\nATTACHMENTS: ${attachmentNames.join(', ')}`
      : '';

  return `You have an email HTML file at /vercel/sandbox/email.html that needs processing.

FROM: ${emailFrom}
SUBJECT: ${emailSubject}${attachmentsLine}

RULES:
${rulesText}

IMPORTANT:
- The user's rules are the source of truth, but preserve the original email as much as possible while applying them.
- Default behavior: keep the email structurally and semantically intact. Make the smallest effective change that satisfies the rules.
- Do not rewrite from scratch unless a rule clearly asks for a full rewrite, a completely new version, or a fundamentally different email.
- If a rule asks to translate the email, translate only user-visible email content that should appear in the rendered message. Do not translate HTML tags, attributes, CSS, URLs, tracking parameters, code snippets, hidden metadata, or technical identifiers unless the rule explicitly asks for that.
- If a rule asks to summarize, condense, simplify, or shorten the email, keep the original intent, key facts, promises, dates, names, links, calls to action, and tone whenever possible.
- If a rule asks to modify or improve the email, edit only the portions necessary to satisfy that request and preserve the rest of the message.
- If a rule asks to change tone, wording, or clarity, retain the original meaning unless the rule explicitly asks to change the meaning.
- If a rule asks to remove content, remove only the targeted content and keep the remaining message intact.
- If a rule asks to completely change, fully rewrite, or regenerate the email, then a substantial rewrite is allowed.
- If a rule asks to translate into a language the email already uses, skip translation and preserve the original content unchanged.

INSTRUCTIONS:
1. IMMEDIATELY write the subject line to /vercel/sandbox/subject.txt. Do this before reading or processing the email. Write the original subject as-is: "${emailSubject}"
2. Read the file /vercel/sandbox/email.html
3. Apply the rules above to both the subject and body.
4. Preserve the original HTML structure, layout, CSS styles, inline styles, classes, links, images, and rendering behavior unless a rule explicitly requires changing them.
5. Modify only content that is necessary to satisfy the rules, keeping untouched content exactly as close to the original as possible.
6. Write the processed HTML back to /vercel/sandbox/email.html (overwrite).
7. If the rules required a subject change, overwrite /vercel/sandbox/subject.txt with the new subject.
8. Do NOT create any other files.`;
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

function readOpencodeTokenPair(
  value: unknown,
): { promptTokens: number; completionTokens: number } | null {
  if (!value || typeof value !== 'object') return null;

  const tokens = value as Record<string, unknown>;
  const promptCandidates = [
    tokens.input,
    tokens.inputTokens,
    tokens.tokensIn,
    tokens.tokens_in,
    tokens.prompt_tokens,
  ];
  const completionCandidates = [
    tokens.output,
    tokens.outputTokens,
    tokens.tokensOut,
    tokens.tokens_out,
    tokens.completion_tokens,
  ];

  const promptTokens = promptCandidates.find((candidate) => typeof candidate === 'number');
  const completionTokens = completionCandidates.find((candidate) => typeof candidate === 'number');
  if (typeof promptTokens !== 'number' && typeof completionTokens !== 'number') {
    return null;
  }

  return {
    promptTokens: typeof promptTokens === 'number' ? promptTokens : 0,
    completionTokens: typeof completionTokens === 'number' ? completionTokens : 0,
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
  const messages = sessionData.messages as Array<Record<string, unknown>> | undefined;

  if (Array.isArray(messages)) {
    for (const message of messages) {
      const messageInfo = message.info as Record<string, unknown> | undefined;
      const messageTokens =
        readOpencodeTokenPair(messageInfo?.tokens) ??
        readOpencodeTokenPair(message.tokens) ??
        readOpencodeTokenPair(message.usage);

      if (messageTokens) {
        promptTokens += messageTokens.promptTokens;
        completionTokens += messageTokens.completionTokens;
        continue;
      }

      const parts = message.parts as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(parts)) continue;

      for (const part of parts) {
        const partTokens = readOpencodeTokenPair(part.tokens) ?? readOpencodeTokenPair(part.usage);
        if (!partTokens) continue;
        promptTokens += partTokens.promptTokens;
        completionTokens += partTokens.completionTokens;
      }
    }
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
    (settings.llmModel as string) || process.env.LLM_MODEL || 'anthropic/claude-haiku-4.5';

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
  }

  const prompt = buildPrompt(emailFrom, emailSubject, rules);

  await mkdir(artifactDir, { recursive: true });

  const promptPath = nodePath.join(artifactDir, `${artifactBaseName}.prompt.txt`);
  const rewrittenHtmlPath = nodePath.join(artifactDir, `${artifactBaseName}.rewritten.html`);
  const rewrittenSubjectPath = nodePath.join(artifactDir, `${artifactBaseName}.subject.txt`);
  const usagePath = nodePath.join(artifactDir, `${artifactBaseName}.usage.json`);
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
    env: { OPENROUTER_API_KEY: openRouterKey },
  });
  console.log('✅ Sandbox ID:', sandbox.sandboxId);

  // Write files
  const opencodeConfig = JSON.stringify(
    {
      $schema: 'https://opencode.ai/config.json',
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
  console.log('🔧 Running: opencode run --format json --model openrouter/' + model);
  console.log('━'.repeat(60));
  console.log('');

  const command = await sandbox.runCommand({
    cmd: 'opencode',
    args: ['run', '--format', 'json', '--model', `openrouter/${model}`, prompt],
    cwd: '/vercel/sandbox',
    env: {
      HOME: '/vercel/sandbox',
      XDG_DATA_HOME: '/vercel/sandbox/.local/share',
      OPENROUTER_API_KEY: openRouterKey,
    },
    detached: true,
  });
  const result = await command.wait();
  const stdout = await result.stdout();
  const stderr = await result.stderr();

  await writeFile(stdoutPath, stdout, 'utf-8');
  await writeFile(stderrPath, stderr, 'utf-8');

  console.log('🪵 OpenCode stdout saved to:', stdoutPath);
  console.log('🪵 OpenCode stderr saved to:', stderrPath);
  if (stdout.trim()) {
    console.log('\n📤 OpenCode stdout:');
    console.log(stdout);
  }
  if (stderr.trim()) {
    console.log('\n📥 OpenCode stderr:');
    console.log(stderr);
  }

  console.log('\n' + '━'.repeat(60));
  console.log('Exit code:', result.exitCode);

  let opencodeSessionId = parseOpencodeSessionId(stdout);
  let promptTokens = 0;
  let completionTokens = 0;
  let exportedSessionData: Record<string, unknown> | null = null;

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
      const usage = extractUsageFromOpencodeExport(parsedSession);
      promptTokens = usage.promptTokens;
      completionTokens = usage.completionTokens;
      opencodeSessionId = usage.sessionId ?? opencodeSessionId;
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
    opencode: {
      sessionId: opencodeSessionId,
      model,
      exitCode: result.exitCode,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
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
      sessionPath,
    },
  };
  await writeFile(usagePath, JSON.stringify(usageData, null, 2), 'utf-8');
  console.log('📊 Usage saved to:', usagePath);
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
