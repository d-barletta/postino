import fs from 'node:fs';
import path from 'node:path';

const PRO_FLAG_TRUE = 'true';
const PRO_MAX_DURATION = 800;
const HOBBY_MAX_DURATION = 300;

const routeFiles = [
  'src/app/api/internal/email-jobs/process/route.ts',
  'src/app/api/internal/email-jobs/process-one/route.ts',
];

function readEnvFromDotEnvLocal(projectRoot: string, key: string): string | undefined {
  const envPath = path.join(projectRoot, '.env.local');
  if (!fs.existsSync(envPath)) return undefined;

  const content = fs.readFileSync(envPath, 'utf-8');
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;

    const k = line.slice(0, eqIdx).trim();
    if (k !== key) continue;

    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }

  return undefined;
}

function resolveIsPro(projectRoot: string): boolean {
  const fromProcess = (process.env.PRO_VERCEL || '').trim().toLowerCase();
  if (fromProcess) return fromProcess === PRO_FLAG_TRUE;

  const fromDotEnv = (readEnvFromDotEnvLocal(projectRoot, 'PRO_VERCEL') || '').trim().toLowerCase();
  return fromDotEnv === PRO_FLAG_TRUE;
}

function main() {
  const projectRoot = process.cwd();
  const isPro = resolveIsPro(projectRoot);
  const targetMaxDuration = isPro ? PRO_MAX_DURATION : HOBBY_MAX_DURATION;

  const pattern = /export const maxDuration = \d+;/;

  for (const relFile of routeFiles) {
    const absFile = path.join(projectRoot, relFile);
    const source = fs.readFileSync(absFile, 'utf-8');

    if (!pattern.test(source)) {
      throw new Error(`Missing maxDuration export in ${relFile}`);
    }

    const next = source.replace(pattern, `export const maxDuration = ${targetMaxDuration};`);

    if (next !== source) {
      fs.writeFileSync(absFile, next, 'utf-8');
      console.log(`[set-max-duration] ${relFile} -> maxDuration=${targetMaxDuration}`);
    } else {
      console.log(`[set-max-duration] ${relFile} already maxDuration=${targetMaxDuration}`);
    }
  }

  console.log(`[set-max-duration] mode=${isPro ? 'pro' : 'hobby'} complete`);
}

main();
