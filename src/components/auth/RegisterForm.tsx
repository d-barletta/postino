'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { registerUser } from '@/lib/auth';
import { isEmailUsingDomain } from '@/lib/email-utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { AlertCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export function RegisterForm() {
  const router = useRouter();
  const { t } = useI18n();
  const tr = t.auth.register;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [assignedEmailDomain, setAssignedEmailDomain] = useState('');
  const [signupMaintenance, setSignupMaintenance] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadPublicSettings = async () => {
      try {
        const res = await fetch('/api/settings/public', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as {
          assignedEmailDomain?: string;
          signupMaintenanceMode?: boolean;
        };
        if (mounted) {
          setAssignedEmailDomain((data.assignedEmailDomain || '').trim().toLowerCase());
          setSignupMaintenance(data.signupMaintenanceMode === true);
        }
      } catch {
        // If settings fail to load, server-side enforcement still protects the flow.
      }
    };

    loadPublicSettings();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError(tr.errors.passwordsMismatch);
      return;
    }
    if (password.length < 8) {
      setError(tr.errors.passwordTooShort);
      return;
    }

    if (assignedEmailDomain && isEmailUsingDomain(email, assignedEmailDomain)) {
      setError(tr.errors.blockedDomain);
      return;
    }

    setLoading(true);
    try {
      await registerUser(email, password);
      router.push('/verify-email');
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };
      if (firebaseError.code === 'auth/email-already-in-use') {
        setError(tr.errors.emailAlreadyInUse);
      } else if (firebaseError.code === 'auth/weak-password') {
        setError(tr.errors.weakPassword);
      } else if (assignedEmailDomain && isEmailUsingDomain(email, assignedEmailDomain)) {
        setError(tr.errors.blockedDomain);
      } else {
        setError(tr.errors.failed);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {signupMaintenance && (
        <Alert variant="warning">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{tr.maintenanceMessage}</AlertDescription>
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
        disabled={signupMaintenance}
      />
      <Input
        label={tr.password}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="new-password"
        placeholder={tr.minChars}
        disabled={signupMaintenance}
      />
      <Input
        label={tr.confirmPassword}
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
        autoComplete="new-password"
        placeholder={tr.repeatPassword}
        disabled={signupMaintenance}
      />
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button
        type="submit"
        loading={loading}
        className="w-full"
        size="md"
        disabled={signupMaintenance}
      >
        {tr.button}
      </Button>
      <p className="text-center text-sm text-gray-600 dark:text-gray-400">
        {tr.alreadyHaveAccount}{' '}
        <Link
          href="/login"
          className="text-yellow-700 dark:text-yellow-300 hover:underline font-medium"
        >
          {tr.signIn}
        </Link>
      </p>
    </form>
  );
}
