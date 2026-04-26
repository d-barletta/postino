import type { NextRequest } from 'next/server';

/**
 * Resolve the base URL for internal server-to-server calls.
 * Prefers NEXT_PUBLIC_APP_URL when set; falls back to reconstructing the
 * origin from the incoming request's Host and x-forwarded-proto headers.
 */
export function getBaseUrl(request: NextRequest): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  if (appUrl) return appUrl;
  const host = request.headers.get('host') || 'localhost:3000';
  const proto =
    request.headers.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
