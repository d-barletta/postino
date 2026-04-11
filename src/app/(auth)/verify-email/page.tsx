'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import {
  clearPendingVerificationEmail,
  getEmailConfirmationRedirectUrl,
  getPendingVerificationEmail,
  setPendingVerificationEmail,
} from '@/lib/auth';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

const INITIAL_RESEND_COUNTDOWN_SECONDS = 15;

export default function VerifyEmailPage() {
  const router = useRouter();
  const { authUser, refreshUser } = useAuth();
  const { t } = useI18n();
  const tv = t.auth.verifyEmail;
  const [resending, setResending] = useState(false);
  const [resendCountdownSeconds, setResendCountdownSeconds] = useState(
    INITIAL_RESEND_COUNTDOWN_SECONDS,
  );
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  useEffect(() => {
    setPendingEmail(getPendingVerificationEmail());
  }, []);

  useEffect(() => {
    if (resendCountdownSeconds <= 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setResendCountdownSeconds((currentSeconds) => Math.max(0, currentSeconds - 1));
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [resendCountdownSeconds]);

  useEffect(() => {
    const supabase = createClient();
    const interval = setInterval(async () => {
      // Poll to see if the user's email has been confirmed
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email_confirmed_at) {
        clearInterval(interval);
        clearPendingVerificationEmail();
        await refreshUser();
        router.push('/dashboard');
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [router, refreshUser]);

  const handleResend = async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const targetEmail = user?.email ?? authUser?.email ?? pendingEmail;
    if (!targetEmail) {
      setError(tv.errors.missingEmail);
      setSent(false);
      return;
    }

    setResending(true);
    setError('');
    setSent(false);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: targetEmail,
        options: {
          emailRedirectTo: getEmailConfirmationRedirectUrl(),
        },
      });

      if (resendError) {
        const resendMessage = resendError.message.toLowerCase();
        if (
          resendMessage.includes('too many') ||
          resendMessage.includes('security purposes') ||
          resendMessage.includes('rate limit')
        ) {
          setError(tv.errors.tooManyRequests);
        } else {
          setError(tv.errors.failed);
        }
        return;
      }

      setPendingVerificationEmail(targetEmail);
      setPendingEmail(targetEmail);
      setResendCountdownSeconds(INITIAL_RESEND_COUNTDOWN_SECONDS);
      setSent(true);
    } finally {
      setResending(false);
    }
  };

  const resendButtonLabel =
    resendCountdownSeconds > 0
      ? tv.resendButtonCountdown.replace('{seconds}', String(resendCountdownSeconds))
      : tv.resendButton;

  return (
    <div className="flex-1 from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="text-6xl mb-6">📧</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">{tv.title}</h1>
        <p className="text-gray-600 mb-6">
          {tv.subtitle}
          <br />
          {tv.instructions}
          <br />
          {tv.checkSpam}
        </p>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <p className="text-sm text-gray-500">{tv.automaticRedirect}</p>
          {error && (
            <Alert variant="destructive" className="text-left">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {sent && (
            <Alert variant="success" className="text-left">
              <AlertDescription>{tv.sentMessage}</AlertDescription>
            </Alert>
          )}
          <Button
            variant="secondary"
            className="w-full"
            loading={resending}
            onClick={handleResend}
            disabled={resendCountdownSeconds > 0}
          >
            {resendButtonLabel}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => router.push('/login')}>
            {tv.backToSignIn}
          </Button>
        </div>
      </div>
    </div>
  );
}
