'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { loginUser, signOut } from '@/lib/auth';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { AlertCircle, LayoutDashboard, LogOut } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export function LoginForm() {
  const router = useRouter();
  const { t } = useI18n();
  const tr = t.auth.login;
  const { authUser, loading: authLoading, getIdToken } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginUser(email, password);
      setLoading(false);
      setRedirecting(true);
      const token = await getIdToken();
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: string; code?: string }
          | null;
        await signOut();
        setError(
          payload?.code === 'email_not_verified' || payload?.error === 'Email not verified'
            ? tr.errors.emailNotVerified
            : tr.errors.suspended,
        );
        setRedirecting(false);
        setLoading(false);
        return;
      }
      router.push('/dashboard');
    } catch (err: unknown) {
      const authError = err as { code?: string };
      if (
        authError.code === 'auth/invalid-credential' ||
        authError.code === 'auth/user-not-found'
      ) {
        setError(tr.errors.invalidCredential);
      } else if (authError.code === 'auth/too-many-requests') {
        setError(tr.errors.tooManyRequests);
      } else if (authError.code === 'auth/email-not-verified') {
        setError(tr.errors.emailNotVerified);
      } else {
        setError(tr.errors.failed);
      }
      setLoading(false);
      setRedirecting(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  const handleGoToDashboard = () => {
    setRedirecting(true);
    router.push('/dashboard');
  };

  if (!authLoading && authUser) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t.auth.dashboardLink.alreadySignedIn}
        </p>
        <div className="flex flex-col gap-3">
          <Button className="w-full" size="md" onClick={handleGoToDashboard} loading={redirecting}>
            <LayoutDashboard className="h-4 w-4" />
            {redirecting
              ? t.auth.dashboardLink.loadingDashboard
              : t.auth.dashboardLink.goToDashboard}
          </Button>
          <Button
            variant="secondary"
            size="md"
            className="w-full"
            onClick={handleSignOut}
            loading={signingOut}
            disabled={redirecting}
          >
            <LogOut className="h-4 w-4" />
            {t.nav.signOut}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label={tr.emailAddress}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
        placeholder="you@example.com"
      />
      <PasswordInput
        label={tr.password}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="current-password"
        placeholder="••••••••"
      />
      <div className="text-right">
        <Link
          href="/forgot-password"
          className="text-sm text-yellow-700 dark:text-yellow-300 hover:underline font-medium"
        >
          {tr.forgotPassword}
        </Link>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" loading={loading} className="w-full" size="md">
        {tr.signIn}
      </Button>
      <p className="text-center text-sm text-gray-600 dark:text-gray-400">
        {tr.noAccount}{' '}
        <Link
          href="/register"
          className="text-yellow-700 dark:text-yellow-300 hover:underline font-medium"
        >
          {tr.signUp}
        </Link>
      </p>
    </form>
  );
}
