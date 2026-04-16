#!/usr/bin/env npx tsx --env-file .env.local
/**
 * Debug script to run the sandbox agent locally with full OpenCode output.
 *
 * Usage:
 *   npm run debug:sandbox -- --log-id <email_log_id>
 *
 * Streams all stdout/stderr from OpenCode to your terminal so you can see
 * exactly what the LLM is doing, which files it reads/writes, and where it
 * stops.
 */

import { Sandbox } from '@vercel/sandbox';
import { createClient } from '@supabase/supabase-js';
import { readdir, readFile } from 'node:fs/promises';
import nodePath from 'node:path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openRouterKey = process.env.OPEN_ROUTER_API_KEY || process.env.OPENROUTER_API_KEY || '';

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
  const logIdArg = process.argv.find((_, i) => process.argv[i - 1] === '--log-id');
  if (!logIdArg) {
    console.error('Usage: npm run debug:sandbox -- --log-id <email_log_id>');
    process.exit(1);
  }

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

  // Load email log
  const { data: logRow } = await supabase
    .from('email_logs')
    .select('user_id, from_address, subject, original_body')
    .eq('id', logIdArg)
    .single();

  if (!logRow) {
    console.error(`Email log ${logIdArg} not found`);
    process.exit(1);
  }

  const emailFrom = (logRow.from_address as string) || '';
  const emailSubject = (logRow.subject as string) || '';
  const emailBody = (logRow.original_body as string) || '';
  const userId = logRow.user_id as string;

  // Load rules
  const { data: rulesRows } = await supabase
    .from('rules')
    .select('id, name, text')
    .eq('user_id', userId)
    .eq('is_active', true);

  const rules = (rulesRows ?? []).map((r) => ({
    id: r.id as string,
    name: (r.name as string) || (r.id as string),
    text: r.text as string,
  }));

  const rulesText =
    rules.length > 0 ? rules.map((r) => `Rule "${r.name}": ${r.text}`).join('\n') : 'No rules.';

  const prompt = `You have an email HTML file at /vercel/sandbox/email.html that needs processing.

FROM: ${emailFrom}
SUBJECT: ${emailSubject}

RULES:
${rulesText}

INSTRUCTIONS:
1. Read the file /vercel/sandbox/email.html
2. Apply the rules above to both the subject and body.
3. Preserve the original HTML structure, CSS styles, inline styles, and images.
4. Only modify content specifically targeted by the rules.
5. Write the processed HTML back to /vercel/sandbox/email.html (overwrite).
6. Write the new subject line to /vercel/sandbox/subject.txt (overwrite).
7. Do NOT create any other files.`;

  console.log('━'.repeat(60));
  console.log('📧 Email from:', emailFrom);
  console.log('📧 Subject:', emailSubject);
  console.log('📧 Body length:', emailBody.length, 'chars');
  console.log('📋 Rules:', rules.length);
  console.log('🤖 Model:', model);
  console.log('📦 Snapshot:', snapshotId);
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
  console.log('🔧 Running: opencode run --model openrouter/' + model);
  console.log('━'.repeat(60));
  console.log('');

  // Run OpenCode with full output streaming to terminal
  const result = await sandbox.runCommand({
    cmd: 'opencode',
    args: ['run', '--model', `openrouter/${model}`, prompt],
    cwd: '/vercel/sandbox',
    env: {
      HOME: '/vercel/sandbox',
      XDG_DATA_HOME: '/vercel/sandbox/.local/share',
      OPENROUTER_API_KEY: openRouterKey,
    },
    stdout: process.stdout,
    stderr: process.stderr,
  });

  console.log('\n' + '━'.repeat(60));
  console.log('Exit code:', result.exitCode);

  // Read results
  const htmlBuf = await sandbox.readFileToBuffer({ path: '/vercel/sandbox/email.html' });
  const subjBuf = await sandbox.readFileToBuffer({ path: '/vercel/sandbox/subject.txt' });

  if (htmlBuf) {
    const html = htmlBuf.toString('utf-8');
    console.log('📄 Processed HTML length:', html.length, 'chars');
    const changed = html !== emailBody;
    console.log('📄 HTML changed:', changed);
    if (changed) {
      console.log('📄 First 500 chars of processed HTML:');
      console.log(html.slice(0, 500));
    }
  } else {
    console.log('⚠️  No processed HTML found');
  }

  if (subjBuf) {
    console.log('📄 Processed subject:', subjBuf.toString('utf-8').trim());
  } else {
    console.log('⚠️  No subject.txt found');
  }

  console.log('\n🧹 Stopping sandbox...');
  await sandbox.stop({ blocking: true });
  console.log('✅ Done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
