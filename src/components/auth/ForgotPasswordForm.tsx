'use client';

import { useState } from 'react';
import Link from 'next/link';
import { sendPasswordReset } from '@/lib/auth';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export function ForgotPasswordForm() {
  const { t } = useI18n();
  const tr = t.auth.forgotPassword;
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await sendPasswordReset(email.trim());
      setSent(true);
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };

      if (firebaseError.code === 'auth/invalid-email') {
        setError(tr.errors.invalidEmail);
      } else if (firebaseError.code === 'auth/too-many-requests') {
        setError(tr.errors.tooManyAttempts);
      } else {
        setError(tr.errors.failed);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {sent && (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{tr.successMessage}</AlertDescription>
        </Alert>
      )}

      <Input
        label={tr.emailAddress}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
        placeholder="you@example.com"
        disabled={loading || sent}
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" loading={loading} className="w-full" size="md" disabled={sent}>
        {tr.sendResetLink}
      </Button>

      <p className="text-center text-sm text-gray-600 dark:text-gray-400">
        {tr.rememberedPassword}{' '}
        <Link href="/login" className="text-yellow-700 dark:text-yellow-300 hover:underline font-medium">
          {tr.backToSignIn}
        </Link>
      </p>
    </form>
  );
}
