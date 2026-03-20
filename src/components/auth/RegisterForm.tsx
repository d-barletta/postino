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

const BLOCKED_DOMAIN_ERROR = "Can't create an account using our email addresses";

export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [assignedEmailDomain, setAssignedEmailDomain] = useState('');

  useEffect(() => {
    let mounted = true;

    const loadPublicSettings = async () => {
      try {
        const res = await fetch('/api/settings/public', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { assignedEmailDomain?: string };
        if (mounted) {
          setAssignedEmailDomain((data.assignedEmailDomain || '').trim().toLowerCase());
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
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (assignedEmailDomain && isEmailUsingDomain(email, assignedEmailDomain)) {
      setError(BLOCKED_DOMAIN_ERROR);
      return;
    }

    setLoading(true);
    try {
      await registerUser(email, password);
      router.push('/verify-email');
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };
      if (firebaseError.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists');
      } else if (firebaseError.code === 'auth/weak-password') {
        setError('Password is too weak');
      } else if (assignedEmailDomain && isEmailUsingDomain(email, assignedEmailDomain)) {
        setError(BLOCKED_DOMAIN_ERROR);
      } else {
        setError('Failed to create account. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Email address"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
        placeholder="you@example.com"
      />
      <Input
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="new-password"
        placeholder="Min. 8 characters"
      />
      <Input
        label="Confirm password"
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
        autoComplete="new-password"
        placeholder="Repeat password"
      />
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" loading={loading} className="w-full" size="md">
        Create account
      </Button>
      <p className="text-center text-sm text-gray-600 dark:text-gray-400">
        Already have an account?{' '}
        <Link href="/login" className="text-yellow-700 dark:text-yellow-300 hover:underline font-medium">
          Sign in
        </Link>
      </p>
    </form>
  );
}
