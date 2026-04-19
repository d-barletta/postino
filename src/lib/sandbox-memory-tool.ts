import crypto from 'crypto';

const MIN_SECRET_LENGTH = 16;
const TOKEN_KIND = 'sandbox-memory-tool';
const TOKEN_TTL_SECONDS = 20 * 60;

interface SandboxMemoryToolClaims {
  kind: typeof TOKEN_KIND;
  userId: string;
  logId: string;
  userEmail: string;
  iat: number;
  exp: number;
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function resolveSandboxMemoryToolSecret(): string {
  const candidates = [
    process.env.OPENCODE_SANDBOX_INTERNAL_SECRET,
    process.env.EMAIL_JOBS_WORKER_SECRET,
    process.env.CRON_SECRET,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ];

  for (const candidate of candidates) {
    const normalized = (candidate || '').trim();
    if (normalized.length >= MIN_SECRET_LENGTH) {
      return normalized;
    }
  }

  return '';
}

export function resolveSandboxMemoryToolBaseUrl(): string {
  const configuredOrigin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    '';

  return configuredOrigin.trim().replace(/\/$/, '');
}

export function createSandboxMemoryToolToken(params: {
  userId: string;
  logId: string;
  userEmail?: string;
}): string | null {
  const secret = resolveSandboxMemoryToolSecret();
  if (!secret) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: SandboxMemoryToolClaims = {
    kind: TOKEN_KIND,
    userId: params.userId,
    logId: params.logId,
    userEmail: (params.userEmail || '').trim(),
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');

  return `${encodedPayload}.${signature}`;
}

export function verifySandboxMemoryToolToken(token: string): {
  userId: string;
  logId: string;
  userEmail: string;
} {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    throw new Error('Unauthorized');
  }

  const secret = resolveSandboxMemoryToolSecret();
  if (!secret) {
    throw new Error('Unauthorized');
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');

  if (!timingSafeStringEqual(signature, expectedSignature)) {
    throw new Error('Unauthorized');
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8'));
  } catch {
    throw new Error('Unauthorized');
  }

  if (!parsedPayload || typeof parsedPayload !== 'object') {
    throw new Error('Unauthorized');
  }

  const claims = parsedPayload as Partial<SandboxMemoryToolClaims>;
  if (
    claims.kind !== TOKEN_KIND ||
    typeof claims.userId !== 'string' ||
    typeof claims.logId !== 'string' ||
    typeof claims.exp !== 'number'
  ) {
    throw new Error('Unauthorized');
  }

  if (claims.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('Unauthorized');
  }

  return {
    userId: claims.userId,
    logId: claims.logId,
    userEmail: typeof claims.userEmail === 'string' ? claims.userEmail : '',
  };
}
