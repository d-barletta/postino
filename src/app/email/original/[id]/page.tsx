'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';

interface OriginalEmail {
  id: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  originalBody: string | null;
  receivedAt: string | null;
}

export default function OriginalEmailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { firebaseUser, loading: authLoading } = useAuth();
  const [email, setEmail] = useState<OriginalEmail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      router.push(`/login?redirect=/email/original/${id}`);
      return;
    }

    const fetchEmail = async () => {
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch(`/api/email/original/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401 || res.status === 403) {
          setError('You do not have permission to view this email.');
          return;
        }
        if (res.status === 404) {
          setError('Email not found.');
          return;
        }
        if (!res.ok) {
          setError('Failed to load email.');
          return;
        }
        const data = await res.json();
        setEmail(data);
      } catch {
        setError('Failed to load email.');
      } finally {
        setLoading(false);
      }
    };

    fetchEmail();
  }, [firebaseUser, authLoading, id, router]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-[#EFD957] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="text-center py-8">
            <i className="bi bi-exclamation-circle text-3xl text-red-500 mb-3" aria-hidden="true" />
            <p className="text-gray-700 dark:text-gray-300">{error}</p>
            <button
              className="mt-4 text-sm text-[#d0b53f] hover:underline"
              onClick={() => router.back()}
            >
              Go back
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!email) return null;

  const receivedDate = email.receivedAt ? new Date(email.receivedAt).toLocaleString() : '—';

  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <button
            className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white flex items-center gap-1"
            onClick={() => router.back()}
          >
            <i className="bi bi-arrow-left" aria-hidden="true" />
            Back
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">{email.subject}</h1>
        </div>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-900 dark:text-white">Original Email</h2>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-gray-500 dark:text-gray-400 font-medium">From:</dt>
              <dd className="text-gray-800 dark:text-gray-200">{email.fromAddress}</dd>
              <dt className="text-gray-500 dark:text-gray-400 font-medium">To:</dt>
              <dd className="text-gray-800 dark:text-gray-200">{email.toAddress}</dd>
              <dt className="text-gray-500 dark:text-gray-400 font-medium">Subject:</dt>
              <dd className="text-gray-800 dark:text-gray-200">{email.subject}</dd>
              <dt className="text-gray-500 dark:text-gray-400 font-medium">Received:</dt>
              <dd className="text-gray-800 dark:text-gray-200">{receivedDate}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-900 dark:text-white">Email Content</h2>
          </CardHeader>
          <CardContent>
            {email.originalBody ? (
              <iframe
                sandbox=""
                srcDoc={email.originalBody}
                className="w-full border-0 rounded"
                style={{ minHeight: '300px' }}
                title="Original email content"
                onLoad={(e) => {
                  const iframe = e.currentTarget;
                  const height = iframe.contentDocument?.documentElement?.scrollHeight;
                  if (height) iframe.style.height = `${height + 20}px`;
                }}
              />
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-sm">No original content stored.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
