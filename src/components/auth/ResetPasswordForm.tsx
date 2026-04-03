'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { resetPassword, verifyResetPasswordCode } from '@/lib/auth';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const actionCode = useMemo(() => searchParams.get('oobCode') ?? '', [searchParams]);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [isCodeValid, setIsCodeValid] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const validateCode = async () => {
      if (!actionCode) {
        setError('Missing reset code. Please request a new password reset link.');
        setValidating(false);
        return;
      }

      try {
        await verifyResetPasswordCode(actionCode);
        setIsCodeValid(true);
      } catch {
        setIsCodeValid(false);
        setError('This reset link is invalid or expired. Request a new one.');
      } finally {
        setValidating(false);
      }
    };

    validateCode();
  }, [actionCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!actionCode) {
      setError('Missing reset code. Please request a new password reset link.');
      return;
    }

    if (!isCodeValid) {
      setError('This reset link is invalid or expired. Request a new one.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      await resetPassword(actionCode, password);
      setSuccess(true);
      setTimeout(() => {
        router.push('/login');
      }, 1800);
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };

      if (
        firebaseError.code === 'auth/expired-action-code' ||
        firebaseError.code === 'auth/invalid-action-code'
      ) {
        setError('This reset link is invalid or expired. Request a new one.');
      } else if (firebaseError.code === 'auth/weak-password') {
        setError('Password is too weak');
      } else {
        setError('Failed to reset password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
          Validating reset link...
        </p>
      </div>
    );
  }

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
        disabled={loading || success || !isCodeValid}
      />

      <Input
        label="Confirm new password"
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
        autoComplete="new-password"
        placeholder="Repeat password"
        disabled={loading || success || !isCodeValid}
      />

      <Button
        type="submit"
        loading={loading}
        className="w-full"
        size="md"
        disabled={success || !isCodeValid}
      >
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
