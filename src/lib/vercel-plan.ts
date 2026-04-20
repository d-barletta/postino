const PRO_FLAG_TRUE = 'true';

function readBooleanEnv(name: string): boolean {
  const value = (process.env[name] || '').trim().toLowerCase();
  return value === PRO_FLAG_TRUE;
}

export const IS_PRO_VERCEL = readBooleanEnv('PRO_VERCEL');

export const VERCEL_TIMEOUTS = {
  emailJobsDispatchBudgetMs: IS_PRO_VERCEL ? 10 * 60 * 1000 : 4 * 60 * 1000,
  sandboxPlatformTimeoutMs: IS_PRO_VERCEL ? 15 * 60 * 1000 : 5 * 60 * 1000,
  sandboxTimeoutMs: IS_PRO_VERCEL ? 14 * 60 * 1000 : 4 * 60 * 1000,
  opencodeRunTimeoutMs: IS_PRO_VERCEL ? 10 * 60 * 1000 : 3 * 60 * 1000,
  opencodeVerifyTimeoutMs: IS_PRO_VERCEL ? 3 * 60 * 1000 : 45 * 1000,
} as const;
