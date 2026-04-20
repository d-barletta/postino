const PRO_FLAG_TRUE = 'true';

function readBooleanEnv(name: string): boolean {
  const value = (process.env[name] || '').trim().toLowerCase();
  return value === PRO_FLAG_TRUE;
}

export const IS_PRO_VERCEL = readBooleanEnv('PRO_VERCEL');

export const VERCEL_TIMEOUTS = {
  sandboxPlatformTimeoutMs: IS_PRO_VERCEL ? 13 * 60 * 1000 : 4.5 * 60 * 1000,
  sandboxTimeoutMs: IS_PRO_VERCEL ? 13 * 60 * 1000 : 4.5 * 60 * 1000,
  emailJobsDispatchBudgetMs: IS_PRO_VERCEL ? 13 * 60 * 1000 : 4.5 * 60 * 1000,
  opencodeRunTimeoutMs: IS_PRO_VERCEL ? 10 * 60 * 1000 : 4 * 60 * 1000,
  opencodeVerifyTimeoutMs: IS_PRO_VERCEL ? 3 * 60 * 1000 : 1 * 60 * 1000,
} as const;
