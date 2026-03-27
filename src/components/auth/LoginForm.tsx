'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { loginUser, signOut } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { AlertCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export function LoginForm() {
  const router = useRouter();
  const { t } = useI18n();
  const tr = t.auth.login;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const fbUser = await loginUser(email, password);
      const token = await fbUser.getIdToken();
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) {
        await signOut();
        setError(tr.errors.suspended);
        return;
      }
      router.push('/dashboard');
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };
      if (firebaseError.code === 'auth/invalid-credential' || firebaseError.code === 'auth/user-not-found') {
        setError(tr.errors.invalidCredential);
      } else if (firebaseError.code === 'auth/too-many-requests') {
        setError(tr.errors.tooManyRequests);
      } else {
        setError(tr.errors.failed);
      }
    } finally {
      setLoading(false);
    }
  };

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
      <Input
        label={tr.password}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="current-password"
        placeholder="••••••••"
      />
      <div className="text-right">
        <Link href="/forgot-password" className="text-sm text-yellow-700 dark:text-yellow-300 hover:underline font-medium">
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
        <Link href="/register" className="text-yellow-700 dark:text-yellow-300 hover:underline font-medium">
          {tr.signUp}
        </Link>
      </p>
    </form>
  );
}
