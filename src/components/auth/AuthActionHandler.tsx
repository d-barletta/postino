'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

type HandlerState =
  | { status: 'loading'; message: string }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

export function AuthActionHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tokenHash = useMemo(() => searchParams.get('token_hash') ?? '', [searchParams]);
  const type = useMemo(() => searchParams.get('type') ?? '', [searchParams]);

  const [state, setState] = useState<HandlerState>({
    status: 'loading',
    message: 'Processing your request...',
  });

  useEffect(() => {
    const run = async () => {
      if (!tokenHash || !type) {
        setState({ status: 'error', message: 'Invalid action link. Please request a new one.' });
        return;
      }

      const supabase = createClient();

      if (type === 'email' || type === 'signup') {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
        if (error) {
          setState({ status: 'error', message: 'This verification link is invalid or expired.' });
          return;
        }
        setState({
          status: 'success',
          message: 'Email verified successfully. You can now sign in.',
        });
        return;
      }

      if (type === 'recovery') {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        });
        if (error) {
          setState({ status: 'error', message: 'This reset link is invalid or expired.' });
          return;
        }
        router.replace('/reset-password');
        return;
      }

      setState({ status: 'error', message: 'Unsupported action type. Please request a new link.' });
    };

    run();
  }, [tokenHash, type, router]);

  return (
    <div className="space-y-4">
      {state.status === 'loading' && (
        <p className="text-sm text-gray-600 dark:text-gray-400 text-center">{state.message}</p>
      )}

      {state.status === 'success' && (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {state.status === 'error' && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {(state.status === 'success' || state.status === 'error') && (
        <div className="space-y-2">
          <Link href="/login" className="block">
            <Button className="w-full" size="md">
              Go to sign in
            </Button>
          </Link>
          <Link href="/forgot-password" className="block">
            <Button variant="secondary" className="w-full" size="md">
              Request password reset
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
