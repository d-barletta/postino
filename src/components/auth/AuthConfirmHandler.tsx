'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

/**
 * Client-side handler for Supabase email confirmation and password-recovery links.
 *
 * Runs in the browser so the PKCE code_verifier (stored in browser storage by
 * createBrowserClient) is available for exchangeCodeForSession().
 *
 * Supports:
 *  - PKCE code flow:  ?code=<auth_code>&next=<path>
 *  - PKCE recovery flow: ?type=recovery&next=<path>
 *    (session already established by /auth/v1/verify endpoint before redirect)
 *  - Token-hash OTP flow: ?token_hash=<hash>&type=<otp_type>&next=<path>
 */
export function AuthConfirmHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get('code');
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type') as EmailOtpType | null;
    const next = searchParams.get('next') ?? '/dashboard';

    const run = async () => {
      const supabase = createClient();

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          router.replace(next);
          return;
        }
      }

      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
        if (!error) {
          router.replace(next);
          return;
        }
      }

      // For recovery type without token_hash: session was already established
      // by Supabase's /auth/v1/verify endpoint before redirecting here.
      // Check if session exists; if yes, redirect to next page.
      if (type === 'recovery') {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          router.replace(next);
          return;
        }
      }

      router.replace('/auth/action?error=invalid_link');
    };

    run();
  }, [router, searchParams]);

  return (
    <p className="text-sm text-gray-600 dark:text-gray-400 text-center">Processing your request…</p>
  );
}
