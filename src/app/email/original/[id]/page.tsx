'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { buildSandboxedEmailSrcDoc } from '@/lib/email-iframe';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/Accordion';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/Dialog';

interface OriginalEmail {
  id: string;
  fromAddress: string;
  toAddress: string;
  ccAddress?: string | null;
  bccAddress?: string | null;
  subject: string;
  originalBody: string | null;
  receivedAt: string | null;
  attachmentCount: number;
  attachmentNames: string[];
}

interface ReprocessResult {
  subject: string;
  body: string;
  tokensUsed: number;
  estimatedCost: number;
  ruleApplied: string;
}

interface OpenRouterModel {
  id: string;
  name: string;
}

export default function OriginalEmailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { firebaseUser, user, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState<OriginalEmail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessResult, setReprocessResult] = useState<ReprocessResult | null>(null);
  const [reprocessError, setReprocessError] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
  };

  // Load available models for admin users
  useEffect(() => {
    if (!firebaseUser || !user?.isAdmin) return;
    setModelsLoading(true);
    firebaseUser.getIdToken().then((token) =>
      fetch('/api/admin/openrouter-models', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => setModels((data.models || []) as OpenRouterModel[]))
        .catch(() => setModels([]))
        .finally(() => setModelsLoading(false))
    );
  }, [firebaseUser, user?.isAdmin]);

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
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedModel ? { model: selectedModel } : {}),
      });
      if (!res.ok) {
        const data = await res.json();
        setReprocessError(data.error || t.emailOriginal.admin.failedToReprocess);
        return;
      }
      const data = await res.json();
      setReprocessResult(data);
    } catch (error) {
      console.error('Reprocess error:', error);
      setReprocessError(t.emailOriginal.admin.failedToReprocess);
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
          setError(t.emailOriginal.errors.noPermission);
          return;
        }
        if (res.status === 404) {
          setError(t.emailOriginal.errors.notFound);
          return;
        }
        if (!res.ok) {
          setError(t.emailOriginal.errors.failedToLoad);
          return;
        }
        const data = await res.json();
        setEmail(data);
      } catch {
        setError(t.emailOriginal.errors.failedToLoad);
      } finally {
        setLoading(false);
      }
    };

    fetchEmail();
    // t is intentionally excluded to avoid re-fetching when locale changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, authLoading, id, router]);

  if (authLoading || loading) {
    return (
      <div className="min-h-svh flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-[#efd957] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-full flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="text-center py-8">
            <i className="bi bi-exclamation-circle text-3xl text-red-500 mb-3" aria-hidden="true" />
            <p className="text-gray-700 dark:text-gray-300">{error}</p>
            <button
              className="mt-4 text-sm text-[#d0b53f] hover:underline"
              onClick={handleBack}
            >
              {t.emailOriginal.back}
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!email) return null;

  const receivedDate = email.receivedAt ? new Date(email.receivedAt).toLocaleString() : '—';

  return (
    <div className="min-h-full">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <button
            className="shrink-0 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white flex items-center gap-1"
            onClick={handleBack}
          >
            <i className="bi bi-arrow-left" aria-hidden="true" />
            {t.emailOriginal.back}
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white min-w-0 truncate">{email.subject}</h1>
        </div>

        <Card>
          <Accordion type="single" collapsible defaultValue="original-email" className="px-6">
            <AccordionItem value="original-email" className="border-b-0">
              <AccordionTrigger className="py-5 font-semibold text-gray-900 hover:text-gray-900 dark:text-white dark:hover:text-white">
                {t.emailOriginal.originalEmail}
              </AccordionTrigger>
              <AccordionContent>
                <CardContent className="p-0 pb-5 space-y-3 text-sm">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                    <dt className="text-gray-500 dark:text-gray-400 font-medium">{t.emailOriginal.from}</dt>
                    <dd className="text-gray-800 dark:text-gray-200 min-w-0 break-all">{email.fromAddress}</dd>
                    <dt className="text-gray-500 dark:text-gray-400 font-medium">{t.emailOriginal.to}</dt>
                    <dd className="text-gray-800 dark:text-gray-200 min-w-0 break-all">{email.toAddress}</dd>
                    {email.ccAddress && (
                      <>
                        <dt className="text-gray-500 dark:text-gray-400 font-medium">{t.emailOriginal.cc}</dt>
                        <dd className="text-gray-800 dark:text-gray-200 min-w-0 break-all">{email.ccAddress}</dd>
                      </>
                    )}
                    {email.bccAddress && (
                      <>
                        <dt className="text-gray-500 dark:text-gray-400 font-medium">{t.emailOriginal.bcc}</dt>
                        <dd className="text-gray-800 dark:text-gray-200 min-w-0 break-all">{email.bccAddress}</dd>
                      </>
                    )}
                    <dt className="text-gray-500 dark:text-gray-400 font-medium">{t.emailOriginal.subject}</dt>
                    <dd className="text-gray-800 dark:text-gray-200 min-w-0 wrap-break-word">{email.subject}</dd>
                    <dt className="text-gray-500 dark:text-gray-400 font-medium">{t.emailOriginal.received}</dt>
                    <dd className="text-gray-800 dark:text-gray-200">{receivedDate}</dd>
                    <dt className="text-gray-500 dark:text-gray-400 font-medium">{t.emailOriginal.attachments}</dt>
                    <dd className="text-gray-800 dark:text-gray-200">
                      {email.attachmentCount > 0 ? (
                        <ul className="list-none space-y-0.5">
                          {email.attachmentNames.map((name, i) => (
                            <li key={i} className="flex items-center gap-1.5 min-w-0">
                              <i className="bi bi-paperclip shrink-0 text-gray-400" aria-hidden="true" />
                              <span className="truncate">{name}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">{t.emailOriginal.noAttachments}</span>
                      )}
                    </dd>
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
                {t.emailOriginal.emailContent}
              </AccordionTrigger>
              <AccordionContent>
                <CardContent className="p-0 pb-5">
                  {email.originalBody ? (
                    <div className="relative space-y-2">
                      {!isFullscreen && (
                        <div className="flex justify-end">
                          <button
                            onClick={toggleFullscreen}
                            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                            title={t.emailOriginal.openFullPageView}
                            aria-label={t.emailOriginal.openFullPageViewAria}
                          >
                            <i className="bi bi-fullscreen" aria-hidden="true" />
                            {t.emailOriginal.openFullPageView}
                          </button>
                        </div>
                      )}
                      <iframe
                        sandbox=""
                        srcDoc={buildSandboxedEmailSrcDoc(email.originalBody)}
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
                    <p className="text-gray-500 dark:text-gray-400 text-sm py-1">{t.emailOriginal.noOriginalContent}</p>
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
                  {t.emailOriginal.admin.currentSetup}
                </AccordionTrigger>
                <AccordionContent>
                  <CardContent className="p-0 pb-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-end gap-3">
                      <div className="flex-1 min-w-48 max-w-xs">
                        <Combobox
                          options={models.map((m) => ({ value: m.id, label: `${m.name} (${m.id})` }) as ComboboxOption)}
                          value={selectedModel}
                          onValueChange={setSelectedModel}
                          placeholder={modelsLoading ? t.emailOriginal.admin.loadingModels : t.emailOriginal.admin.defaultModel}
                          searchPlaceholder={t.emailOriginal.admin.searchModels}
                          emptyText={t.emailOriginal.admin.noModelsFound}
                          disabled={modelsLoading}
                        />
                      </div>
                      <button
                        onClick={handleReprocess}
                        disabled={reprocessing}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-[#efd957] hover:bg-[#d0b53f] text-black rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {reprocessing ? (
                          <>
                            <div className="animate-spin h-3.5 w-3.5 border-2 border-gray-900 border-t-transparent rounded-full" />
                            {t.emailOriginal.admin.processing}
                          </>
                        ) : (
                          <>
                            <i className="bi bi-arrow-repeat" aria-hidden="true" />
                            {t.emailOriginal.admin.reprocess}
                          </>
                        )}
                      </button>
                    </div>

                    {reprocessError && <p className="text-sm text-red-500">{reprocessError}</p>}

                    {reprocessResult && (
                      <>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                          <dt className="text-gray-500 dark:text-gray-400 font-medium">{t.emailOriginal.subject}</dt>
                          <dd className="text-gray-800 dark:text-gray-200 min-w-0 wrap-break-word">{reprocessResult.subject}</dd>
                          <dt className="text-gray-500 dark:text-gray-400 font-medium">{t.emailOriginal.admin.ruleApplied}</dt>
                          <dd className="text-gray-800 dark:text-gray-200">{reprocessResult.ruleApplied}</dd>
                          <dt className="text-gray-500 dark:text-gray-400 font-medium">{t.emailOriginal.admin.tokensUsed}</dt>
                          <dd className="text-gray-800 dark:text-gray-200">{reprocessResult.tokensUsed.toLocaleString()}</dd>
                          <dt className="text-gray-500 dark:text-gray-400 font-medium">{t.emailOriginal.admin.estCost}</dt>
                          <dd className="text-gray-800 dark:text-gray-200">${reprocessResult.estimatedCost.toFixed(6)}</dd>
                        </dl>
                        <div>
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t.emailOriginal.admin.processedBody}</p>
                          <iframe
                            sandbox=""
                            srcDoc={buildSandboxedEmailSrcDoc(reprocessResult.body)}
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

      {/* Full email modal */}
      <Dialog
        open={!!(isFullscreen && email.originalBody)}
        onOpenChange={(open) => { if (!open) setIsFullscreen(false); }}
      >
        <DialogContent hideCloseButton animation="slide-from-bottom" className="w-[95vw] max-w-4xl h-[92vh] flex flex-col p-0 overflow-hidden gap-0" aria-describedby={undefined}>
          {email.originalBody && (
            <iframe
              sandbox=""
              srcDoc={buildSandboxedEmailSrcDoc(email.originalBody)}
              className="w-full flex-1 border-0"
              title="Original email content full page"
            />
          )}
          <DialogFooter className="shrink-0 px-6 py-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-row items-center justify-between gap-2">
            <DialogTitle className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {email.subject}
            </DialogTitle>
            <DialogClose asChild>
              <Button variant="outline" size="sm" className="shrink-0">
                {t.dashboard.rules.close}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
