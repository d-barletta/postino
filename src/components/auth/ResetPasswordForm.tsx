'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { resetPassword } from '@/lib/auth';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export function ResetPasswordForm() {
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      // Session is already active (established by /auth/confirm redirect)
      await resetPassword('', password);
      setSuccess(true);
      setTimeout(() => {
        router.push('/login');
      }, 1800);
    } catch (err: unknown) {
      const authError = err as { code?: string };
      if (authError.code === 'auth/weak-password') {
        setError('Password is too weak');
      } else {
        setError('Failed to reset password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {success && (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            Your password has been updated. Redirecting to sign in...
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Input
        label="New password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="new-password"
        placeholder="Min. 8 characters"
        disabled={loading || success}
      />

      <Button type="submit" loading={loading} className="w-full" size="md" disabled={success}>
        Reset password
      </Button>

      <p className="text-center text-sm text-gray-600 dark:text-gray-400">
        Back to{' '}
        <Link
          href="/login"
          className="text-yellow-700 dark:text-yellow-300 hover:underline font-medium"
        >
          sign in
        </Link>
      </p>

      {!success && (
        <p className="text-center text-sm text-gray-600 dark:text-gray-400">
          Need a new link?{' '}
          <Link
            href="/forgot-password"
            className="text-yellow-700 dark:text-yellow-300 hover:underline font-medium"
          >
            Request password reset
          </Link>
        </p>
      )}
    </form>
  );
}
