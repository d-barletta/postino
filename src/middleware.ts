import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Middleware is required by Next.js for the proxy/matcher config,
// but auth is handled client-side and in API routes.
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
