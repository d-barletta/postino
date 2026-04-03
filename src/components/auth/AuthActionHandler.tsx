'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { applyActionCode } from 'firebase/auth';
import { auth } from '@/lib/firebase';
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

  const mode = useMemo(() => searchParams.get('mode') ?? '', [searchParams]);
  const oobCode = useMemo(() => searchParams.get('oobCode') ?? '', [searchParams]);

  const [state, setState] = useState<HandlerState>({
    status: 'loading',
    message: 'Processing your request...',
  });

  useEffect(() => {
    const run = async () => {
      if (!mode || !oobCode) {
        setState({
          status: 'error',
          message: 'Invalid action link. Please request a new one.',
        });
        return;
      }

      if (mode === 'resetPassword') {
        router.replace(`/reset-password?oobCode=${encodeURIComponent(oobCode)}`);
        return;
      }

      if (!auth) {
        setState({
          status: 'error',
          message: 'Authentication is not configured. Please contact support.',
        });
        return;
      }

      try {
        if (mode === 'verifyEmail') {
          await applyActionCode(auth, oobCode);
          await auth.currentUser?.getIdToken(true);
          setState({
            status: 'success',
            message: 'Email verified successfully. You can now sign in.',
          });
          return;
        }

        if (mode === 'recoverEmail') {
          await applyActionCode(auth, oobCode);
          setState({
            status: 'success',
            message: 'Your email address has been restored. Please sign in again.',
          });
          return;
        }

        setState({
          status: 'error',
          message: 'Unsupported action type. Please request a new link.',
        });
      } catch (err: unknown) {
        const firebaseError = err as { code?: string };
        if (
          firebaseError.code === 'auth/expired-action-code' ||
          firebaseError.code === 'auth/invalid-action-code'
        ) {
          setState({
            status: 'error',
            message: 'This link is invalid or expired. Please request a new one.',
          });
          return;
        }

        setState({
          status: 'error',
          message: 'Failed to process this action. Please try again.',
        });
      }
    };

    run();
  }, [mode, oobCode, router]);

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
