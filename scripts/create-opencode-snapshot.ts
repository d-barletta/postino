#!/usr/bin/env npx tsx
/**
 * Creates a Vercel Sandbox snapshot with OpenCode pre-installed.
 *
 * Usage:
 *   npm run create:sandbox-snapshot
 *
 * Auth: Uses VERCEL_OIDC_TOKEN from .env.local (run `vercel env pull` to refresh).
 *       Alternatively set VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID.
 *
 * The script prints the snapshot ID which you then paste into Admin → Settings → Agent → Sandbox Snapshot ID.
 */

import { Sandbox } from '@vercel/sandbox';

async function main() {
  const hasOidc = Boolean(process.env.VERCEL_OIDC_TOKEN);
  const hasToken = Boolean(process.env.VERCEL_TOKEN);

  if (!hasOidc && !hasToken) {
    console.error(
      'Auth required. Either:\n' +
        '  • Run `vercel env pull` to get VERCEL_OIDC_TOKEN in .env.local, or\n' +
        '  • Set VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID env vars.',
    );
    process.exit(1);
  }

  console.log('Creating sandbox…');
  const sandbox = await Sandbox.create({
    runtime: 'node24',
    timeout: 5 * 60 * 1000, // 5 minutes
  });

  console.log('Installing opencode-ai…');
  const install = await sandbox.runCommand({
    cmd: 'npm',
    args: ['install', '-g', 'opencode-ai'],
    stdout: process.stdout,
    stderr: process.stderr,
  });
  if (install.exitCode !== 0) {
    console.error('Failed to install opencode-ai (exit code ' + install.exitCode + ')');
    process.exit(1);
  }
  console.log('opencode-ai installed.');

  // Run `opencode --version` once so OpenCode performs its one-time SQLite
  // migration now and bakes the migrated database into the snapshot.
  // Without this the migration runs on every sandbox boot, adding a few
  // seconds of startup latency and noise to stderr on every email processed.
  console.log('Priming OpenCode database (one-time migration)…');
  const prime = await sandbox.runCommand({
    cmd: 'opencode',
    args: ['--version'],
    env: {
      HOME: '/vercel/sandbox',
      XDG_DATA_HOME: '/vercel/sandbox/.local/share',
    },
    stdout: process.stdout,
    stderr: process.stderr,
  });
  if (prime.exitCode !== 0) {
    // Non-fatal: migration may have still succeeded even with a non-zero exit.
    console.warn('opencode --version exited with code', prime.exitCode, '(non-fatal)');
  } else {
    console.log('OpenCode database primed.');
  }

  console.log('Taking snapshot (expiration: 0 = never expires)…');
  const snapshot = await sandbox.snapshot({ expiration: 0 });

  console.log('\n✅ Snapshot created successfully!');
  console.log(`   Snapshot ID: ${snapshot.snapshotId}`);
  console.log('\nPaste this ID into Admin → Settings → Agent → Sandbox Snapshot ID.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
