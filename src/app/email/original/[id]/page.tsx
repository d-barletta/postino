'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/Card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/Accordion';

interface OriginalEmail {
  id: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  originalBody: string | null;
  receivedAt: string | null;
}

interface ReprocessResult {
  subject: string;
  body: string;
  tokensUsed: number;
  estimatedCost: number;
  ruleApplied: string;
}

export default function OriginalEmailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { firebaseUser, user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState<OriginalEmail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessResult, setReprocessResult] = useState<ReprocessResult | null>(null);
  const [reprocessError, setReprocessError] = useState('');

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
  };

  useEffect(() => {
    if (!isFullscreen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFullscreen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isFullscreen]);

  const handleBack = () => {
    if (typeof window !== 'undefined' && document.referrer && document.referrer.startsWith(window.location.origin)) {
      router.back();
    } else {
      router.push('/dashboard');
    }
  };

  const handleReprocess = async () => {
    if (!firebaseUser) return;
    setReprocessing(true);
    setReprocessError('');
    setReprocessResult(null);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/admin/email/${id}/reprocess`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        setReprocessError(data.error || 'Failed to reprocess email.');
        return;
      }
      const data = await res.json();
      setReprocessResult(data);
    } catch (error) {
      console.error('Reprocess error:', error);
      setReprocessError('Failed to reprocess email.');
    } finally {
      setReprocessing(false);
    }
  };

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
              onClick={handleBack}
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
            className="shrink-0 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white flex items-center gap-1"
            onClick={handleBack}
          >
            <i className="bi bi-arrow-left" aria-hidden="true" />
            Back
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white min-w-0 truncate">{email.subject}</h1>
        </div>

        <Card>
          <Accordion type="single" collapsible defaultValue="original-email" className="px-6">
            <AccordionItem value="original-email" className="border-b-0">
              <AccordionTrigger className="py-5 font-semibold text-gray-900 hover:text-gray-900 dark:text-white dark:hover:text-white">
                Original Email
              </AccordionTrigger>
              <AccordionContent>
                <CardContent className="p-0 pb-5 space-y-3 text-sm">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                    <dt className="text-gray-500 dark:text-gray-400 font-medium">From:</dt>
                    <dd className="text-gray-800 dark:text-gray-200 min-w-0 break-all">{email.fromAddress}</dd>
                    <dt className="text-gray-500 dark:text-gray-400 font-medium">To:</dt>
                    <dd className="text-gray-800 dark:text-gray-200 min-w-0 break-all">{email.toAddress}</dd>
                    <dt className="text-gray-500 dark:text-gray-400 font-medium">Subject:</dt>
                    <dd className="text-gray-800 dark:text-gray-200 min-w-0 wrap-break-word">{email.subject}</dd>
                    <dt className="text-gray-500 dark:text-gray-400 font-medium">Received:</dt>
                    <dd className="text-gray-800 dark:text-gray-200">{receivedDate}</dd>
                  </dl>
                </CardContent>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Card>

        <Card>
          <Accordion type="single" collapsible defaultValue="email-content" className="px-6">
            <AccordionItem value="email-content" className="border-b-0">
              <AccordionTrigger className="py-5 font-semibold text-gray-900 hover:text-gray-900 dark:text-white dark:hover:text-white">
                Email Content
              </AccordionTrigger>
              <AccordionContent>
                <CardContent className="p-0 pb-5">
                  {email.originalBody ? (
                    <div className="relative space-y-2">
                      {!isFullscreen && (
                        <div className="flex justify-end">
                          <button
                            onClick={toggleFullscreen}
                            className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                            title="Open full page view"
                            aria-label="Open email in full page view"
                          >
                            <i className="bi bi-fullscreen" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                      <iframe
                        sandbox=""
                        srcDoc={email.originalBody}
                        className="w-full border-0 rounded-xl"
                        style={{ minHeight: '300px' }}
                        title="Original email content"
                        onLoad={(e) => {
                          const iframe = e.currentTarget;
                          const height = iframe.contentDocument?.documentElement?.scrollHeight;
                          if (height) iframe.style.height = `${height + 20}px`;
                        }}
                      />
                    </div>
                  ) : (
                    <p className="text-gray-500 dark:text-gray-400 text-sm py-1">No original content stored.</p>
                  )}
                </CardContent>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Card>

        {user?.isAdmin && email.originalBody && (
          <Card>
            <Accordion type="single" collapsible defaultValue="current-setup" className="px-6">
              <AccordionItem value="current-setup" className="border-b-0">
                <AccordionTrigger className="py-5 font-semibold text-gray-900 hover:text-gray-900 dark:text-white dark:hover:text-white">
                  Current setup
                </AccordionTrigger>
                <AccordionContent>
                  <CardContent className="p-0 pb-5 space-y-4">
                    <div className="flex justify-end">
                      <button
                        onClick={handleReprocess}
                        disabled={reprocessing}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-[#EFD957] hover:bg-[#d0b53f] text-gray-900 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {reprocessing ? (
                          <>
                            <div className="animate-spin h-3.5 w-3.5 border-2 border-gray-900 border-t-transparent rounded-full" />
                            Processing…
                          </>
                        ) : (
                          <>
                            <i className="bi bi-arrow-repeat" aria-hidden="true" />
                            Re-process
                          </>
                        )}
                      </button>
                    </div>

                    {reprocessError && <p className="text-sm text-red-500">{reprocessError}</p>}

                    {reprocessResult && (
                      <>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                          <dt className="text-gray-500 dark:text-gray-400 font-medium">Subject:</dt>
                          <dd className="text-gray-800 dark:text-gray-200 min-w-0 wrap-break-word">{reprocessResult.subject}</dd>
                          <dt className="text-gray-500 dark:text-gray-400 font-medium">Rule applied:</dt>
                          <dd className="text-gray-800 dark:text-gray-200">{reprocessResult.ruleApplied}</dd>
                          <dt className="text-gray-500 dark:text-gray-400 font-medium">Tokens used:</dt>
                          <dd className="text-gray-800 dark:text-gray-200">{reprocessResult.tokensUsed.toLocaleString()}</dd>
                          <dt className="text-gray-500 dark:text-gray-400 font-medium">Est. cost:</dt>
                          <dd className="text-gray-800 dark:text-gray-200">${reprocessResult.estimatedCost.toFixed(6)}</dd>
                        </dl>
                        <div>
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Processed body:</p>
                          <iframe
                            sandbox=""
                            srcDoc={reprocessResult.body}
                            className="w-full border-0 rounded-lg"
                            style={{ minHeight: '300px' }}
                            title="Processed email content"
                            onLoad={(e) => {
                              const iframe = e.currentTarget;
                              const height = iframe.contentDocument?.documentElement?.scrollHeight;
                              if (height) iframe.style.height = `${height + 20}px`;
                            }}
                          />
                        </div>
                      </>
                    )}
                  </CardContent>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Card>
        )}
      </div>

      {isFullscreen && email.originalBody && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900">
          <div className="absolute inset-0 flex flex-col">
            <div className="h-14 px-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate pr-4">{email.subject}</p>
              <button
                onClick={toggleFullscreen}
                className="shrink-0 rounded-md p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Close full page view"
                aria-label="Close full page view"
              >
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
            <iframe
              sandbox=""
              srcDoc={email.originalBody}
              className="w-full flex-1 border-0"
              style={{ minHeight: 'calc(100dvh - 56px)' }}
              title="Original email content full page"
            />
          </div>
        </div>
      )}
    </div>
  );
}
