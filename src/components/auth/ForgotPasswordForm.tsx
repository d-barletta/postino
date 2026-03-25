'use client';

import { useState } from 'react';
import Link from 'next/link';
import { sendPasswordReset } from '@/lib/auth';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export function ForgotPasswordForm() {
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
        setError('Invalid email address');
      } else if (firebaseError.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later.');
      } else {
        setError('Failed to send reset email. Please try again.');
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
          <AlertDescription>
            If an account exists for this email, we sent you a password reset link.
          </AlertDescription>
        </Alert>
      )}

      <Input
        label="Email address"
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
        Send reset link
      </Button>

      <p className="text-center text-sm text-gray-600 dark:text-gray-400">
        Remembered your password?{' '}
        <Link href="/login" className="text-yellow-700 dark:text-yellow-300 hover:underline font-medium">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
