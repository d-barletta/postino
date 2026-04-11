'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';

export default function VerifyEmailPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [resending, setResending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const interval = setInterval(async () => {
      // Poll to see if the user's email has been confirmed
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email_confirmed_at) {
        clearInterval(interval);
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
    if (!user?.email) return;
    setResending(true);
    try {
      await supabase.auth.resend({ type: 'signup', email: user.email });
      setSent(true);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex-1 from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="text-6xl mb-6">📧</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Verify your email</h1>
        <p className="text-gray-600 mb-6">
          We&apos;ve sent a verification link to your email address.
          <br />
          Click the link to verify and access your dashboard.
          <br />
          Check also the spam folder.
        </p>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <p className="text-sm text-gray-500">
            This page will automatically redirect once verified.
          </p>
          {sent && (
            <div className="bg-green-50 text-green-700 rounded-lg p-3 text-sm">
              Verification email sent!
            </div>
          )}
          <Button variant="secondary" className="w-full" loading={resending} onClick={handleResend}>
            Resend verification email
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => router.push('/login')}>
            Back to sign in
          </Button>
        </div>
      </div>
    </div>
  );
}
