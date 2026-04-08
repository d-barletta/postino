'use client';

import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/Card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/Accordion';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { Label } from '@/components/ui/Label';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { Separator } from '@/components/ui/Separator';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Settings } from '@/types';

interface OpenRouterModel {
  id: string;
  name: string;
}

interface AdminSettingsPageProps {
  showPageHeader?: boolean;
}

const AGENT_LIMITS = {
  chunkThresholdChars: { min: 5000, max: 300000 },
  chunkSizeChars: { min: 1000, max: 100000 },
  chunkExtractMaxTokens: { min: 100, max: 4000 },
  analysisMaxTokens: { min: 100, max: 2000 },
  bodyAnalysisMaxChars: { min: 500, max: 100000 },
  chunkFallbackMaxChars: { min: 200, max: 10000 },
  fallbackPassMaxTokens: { min: 500, max: 6000 },
} as const;

type NumberBounds = {
  min?: number;
  max?: number;
};

function parseOptionalIntegerInput(
  rawValue: string,
  previousValue: number | undefined,
): number | undefined {
  if (rawValue === '') return undefined;
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isNaN(parsed) ? previousValue : parsed;
}

function normalizeOptionalInteger(
  value: number | undefined,
  bounds?: NumberBounds,
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  let normalized = Math.floor(value);
  if (typeof bounds?.min === 'number') normalized = Math.max(bounds.min, normalized);
  if (typeof bounds?.max === 'number') normalized = Math.min(bounds.max, normalized);
  return normalized;
}

export default function AdminSettingsPage({ showPageHeader = true }: AdminSettingsPageProps) {
  const { firebaseUser } = useAuth();
  const { t } = useI18n();
  const [settings, setSettings] = useState<Partial<Settings>>({
    maxRuleLength: 1000,
    maxActiveRules: 3,
    llmModel: 'openai/gpt-4o-mini',
    llmApiKey: '',
    llmMaxTokens: 4000,
    llmSystemPrompt: '',
    emailSubjectPrefix: '[Postino]',
    agentChunkThresholdChars: 60000,
    agentChunkSizeChars: 15000,
    agentChunkExtractMaxTokens: 600,
    agentAnalysisMaxTokens: 300,
    agentBodyAnalysisMaxChars: 20000,
    agentChunkFallbackMaxChars: 2000,
    agentFallbackMaxTokens: 3000,
    agentTracingEnabled: true,
    agentTraceIncludeExcerpts: false,
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    smtpFromName: '',
    smtpFromEmail: '',
    emailDomain: '',
    mailgunApiKey: '',
    mailgunWebhookSigningKey: '',
    mailgunDomain: '',
    mailgunSandboxEmail: '',
    mailgunBaseUrl: 'https://api.mailgun.net',
    maintenanceMode: false,
    signupMaintenanceMode: false,
    rulesExecutionMode: 'sequential',
    memoryEnabled: false,
    memoryApiKey: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [llmTesting, setLlmTesting] = useState(false);
  const [llmTestResult, setLlmTestResult] = useState<{
    ok: boolean;
    message: string;
    detail?: string;
  } | null>(null);
  const [mailgunTestTo, setMailgunTestTo] = useState('');
  const [mailgunTesting, setMailgunTesting] = useState(false);
  const [mailgunTestResult, setMailgunTestResult] = useState<{
    ok: boolean;
    message: string;
    detail?: string;
  } | null>(null);
  const normalizedMailgunBaseUrl = (settings.mailgunBaseUrl || '').trim().toLowerCase();
  const normalizedMailgunDomain = (settings.mailgunDomain || settings.mailgunSandboxEmail || '')
    .trim()
    .toLowerCase();
  const expectsEuRegion =
    normalizedMailgunDomain.includes('.eu.') || normalizedMailgunDomain.endsWith('.eu');
  const usesEuBaseUrl = normalizedMailgunBaseUrl.includes('api.eu.mailgun.net');
  const showMailgunRegionWarning =
    expectsEuRegion && normalizedMailgunBaseUrl.length > 0 && !usesEuBaseUrl;

  useEffect(() => {
    const fetchSettings = async () => {
      if (!firebaseUser) return;
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch('/api/admin/settings', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSettings((prev) => ({ ...prev, ...data.settings }));
        }
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [firebaseUser]);

  useEffect(() => {
    const fetchModels = async () => {
      if (!firebaseUser) return;
      setModelsLoading(true);
      setModelsError('');
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch('/api/admin/openrouter-models', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) {
          setModels([]);
          setModelsError(data.error || 'Failed to load models');
          return;
        }
        setModels((data.models || []) as OpenRouterModel[]);
      } catch {
        setModels([]);
        setModelsError('Failed to load models');
      } finally {
        setModelsLoading(false);
      }
    };
    fetchModels();
  }, [firebaseUser]);

  const handleTestLlm = async () => {
    if (!firebaseUser) return;
    setLlmTesting(true);
    setLlmTestResult(null);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/admin/test-llm', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.chatCompletion === 'ok') {
        setLlmTestResult({
          ok: true,
          message: `Connection successful — model: ${data.model}`,
          detail: data.chatResponse,
        });
      } else {
        setLlmTestResult({
          ok: false,
          message: 'Connection failed',
          detail: data.chatError || JSON.stringify(data),
        });
      }
    } catch (err) {
      setLlmTestResult({
        ok: false,
        message: 'Request failed',
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLlmTesting(false);
    }
  };

  const handleTestMailgun = async () => {
    if (!firebaseUser) return;

    setMailgunTesting(true);
    setMailgunTestResult(null);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/admin/test-mailgun', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: mailgunTestTo,
          mailgunApiKey: settings.mailgunApiKey || '',
          mailgunDomain: settings.mailgunDomain || '',
          mailgunSandboxEmail: settings.mailgunSandboxEmail || '',
          mailgunBaseUrl: settings.mailgunBaseUrl || '',
          smtpFrom: settings.smtpFrom || '',
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMailgunTestResult({
          ok: true,
          message: data.message || 'Test email sent successfully',
          detail: typeof data.detail === 'string' ? data.detail : undefined,
        });
      } else {
        const detail =
          typeof data.detail === 'string'
            ? data.detail
            : typeof data.error === 'string'
              ? data.error
              : 'Request failed';
        setMailgunTestResult({
          ok: false,
          message: typeof data.error === 'string' ? data.error : 'Mailgun test failed',
          detail,
        });
      }
    } catch (err) {
      setMailgunTestResult({
        ok: false,
        message: 'Request failed',
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setMailgunTesting(false);
    }
  };

  const handleSave = async () => {
    if (!firebaseUser) return;

    const normalizedForSave: Partial<Settings> = {
      ...settings,
      maxRuleLength: normalizeOptionalInteger(settings.maxRuleLength, { min: 1 }),
      maxActiveRules: normalizeOptionalInteger(settings.maxActiveRules, { min: 1 }),
      llmMaxTokens: normalizeOptionalInteger(settings.llmMaxTokens, { min: 1 }),
      smtpPort: normalizeOptionalInteger(settings.smtpPort, { min: 1, max: 65535 }),
      agentChunkThresholdChars: normalizeOptionalInteger(settings.agentChunkThresholdChars, {
        min: AGENT_LIMITS.chunkThresholdChars.min,
        max: AGENT_LIMITS.chunkThresholdChars.max,
      }),
      agentChunkSizeChars: normalizeOptionalInteger(settings.agentChunkSizeChars, {
        min: AGENT_LIMITS.chunkSizeChars.min,
        max: AGENT_LIMITS.chunkSizeChars.max,
      }),
      agentChunkExtractMaxTokens: normalizeOptionalInteger(settings.agentChunkExtractMaxTokens, {
        min: AGENT_LIMITS.chunkExtractMaxTokens.min,
        max: AGENT_LIMITS.chunkExtractMaxTokens.max,
      }),
      agentAnalysisMaxTokens: normalizeOptionalInteger(settings.agentAnalysisMaxTokens, {
        min: AGENT_LIMITS.analysisMaxTokens.min,
        max: AGENT_LIMITS.analysisMaxTokens.max,
      }),
      agentBodyAnalysisMaxChars: normalizeOptionalInteger(settings.agentBodyAnalysisMaxChars, {
        min: AGENT_LIMITS.bodyAnalysisMaxChars.min,
        max: AGENT_LIMITS.bodyAnalysisMaxChars.max,
      }),
      agentChunkFallbackMaxChars: normalizeOptionalInteger(settings.agentChunkFallbackMaxChars, {
        min: AGENT_LIMITS.chunkFallbackMaxChars.min,
        max: AGENT_LIMITS.chunkFallbackMaxChars.max,
      }),
      agentFallbackMaxTokens: normalizeOptionalInteger(settings.agentFallbackMaxTokens, {
        min: AGENT_LIMITS.fallbackPassMaxTokens.min,
        max: AGENT_LIMITS.fallbackPassMaxTokens.max,
      }),
    };

    const threshold = normalizedForSave.agentChunkThresholdChars;
    const chunkSize = normalizedForSave.agentChunkSizeChars;
    if (typeof threshold === 'number' && typeof chunkSize === 'number' && chunkSize >= threshold) {
      setSaveError('Agent Settings invalid: Chunk Size must be smaller than Chunk Threshold.');
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedForSave),
      });
      if (res.ok) {
        toast.success(t.admin.toasts.settingsSaved);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || 'Failed to save settings');
      }
    } finally {
      setSaving(false);
    }
  };

  // Build model options for Combobox — add a star icon to indicate if the saved model is not in the fetched list
  const modelOptions: ComboboxOption[] = [];
  if (settings.llmModel && !models.some((m) => m.id === settings.llmModel)) {
    modelOptions.push({
      value: settings.llmModel,
      label: `${settings.llmModel} (currently saved)`,
      icon: (
        <span title="Currently saved model" className="text-amber-500">
          ★
        </span>
      ),
    });
  }
  models.forEach((m) => modelOptions.push({ value: m.id, label: `${m.name} (${m.id})` }));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100svh-8rem)]">
        <div className="animate-spin h-8 w-8 border-4 border-[#efd957] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {showPageHeader && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Platform Settings</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Configure Postino&apos;s core settings
          </p>
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">Maintenance Mode</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  When enabled, no emails will be forwarded to any user.
                </p>
              </div>
              <Switch
                id="maintenance-mode"
                checked={!!settings.maintenanceMode}
                onCheckedChange={(checked) =>
                  setSettings((p) => ({ ...p, maintenanceMode: checked }))
                }
              />
            </div>
            {settings.maintenanceMode && (
              <Alert variant="warning">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Maintenance mode is <strong>ON</strong> — emails are not being forwarded.
                </AlertDescription>
              </Alert>
            )}

            <Separator className="mt-3" />
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  Signup Maintenance Mode
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  When enabled, new user registrations are suspended and a warning is shown on the
                  signup page.
                </p>
              </div>
              <Switch
                id="signup-maintenance-mode"
                checked={!!settings.signupMaintenanceMode}
                onCheckedChange={(checked) =>
                  setSettings((p) => ({ ...p, signupMaintenanceMode: checked }))
                }
              />
            </div>
            {settings.signupMaintenanceMode && (
              <Alert variant="warning">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Signup maintenance mode is <strong>ON</strong> — new user registrations are
                  suspended.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <Separator className="mt-6" />

          <Accordion type="multiple">
            <AccordionItem value="llm">
              <AccordionTrigger>AI / LLM Settings</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="llm-api-key"
                      className="text-sm font-medium leading-none text-gray-700 dark:text-gray-300"
                    >
                      OpenRouter API Key
                    </label>
                    <div className="flex gap-2 items-center">
                      <div className="flex-1 min-w-0">
                        <Input
                          id="llm-api-key"
                          type="password"
                          value={settings.llmApiKey || ''}
                          onChange={(e) =>
                            setSettings((p) => ({ ...p, llmApiKey: e.target.value }))
                          }
                          placeholder="sk-or-..."
                        />
                      </div>
                      <Button onClick={handleTestLlm} loading={llmTesting} variant="secondary">
                        Test
                      </Button>
                    </div>
                    {llmTestResult && (
                      <div
                        className={cn(
                          'text-sm flex flex-col gap-0.5',
                          llmTestResult.ok
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400',
                        )}
                      >
                        <span className="flex items-center gap-1">
                          {llmTestResult.ok ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : (
                            <AlertCircle className="h-4 w-4" />
                          )}
                          {llmTestResult.message}
                        </span>
                        {llmTestResult.detail && (
                          <span className="text-xs opacity-75 font-mono">
                            {llmTestResult.detail}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="llm-model">LLM Model</Label>
                    <Combobox
                      options={modelOptions}
                      value={settings.llmModel || ''}
                      onValueChange={(v) => setSettings((p) => ({ ...p, llmModel: v }))}
                      placeholder={modelsLoading ? 'Loading models…' : 'Select a model'}
                      searchPlaceholder="Search models..."
                      emptyText="No models found."
                      disabled={modelsLoading}
                    />
                    {modelsError ? (
                      <p className="text-xs text-red-600 dark:text-red-400">{modelsError}</p>
                    ) : (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Fetched live from OpenRouter
                      </p>
                    )}
                  </div>
                  <Input
                    label="Max Rule Length (characters)"
                    type="number"
                    value={settings.maxRuleLength ?? ''}
                    onChange={(e) => {
                      setSettings((p) => ({
                        ...p,
                        maxRuleLength: parseOptionalIntegerInput(e.target.value, p.maxRuleLength),
                      }));
                    }}
                    onBlur={() => {
                      setSettings((p) => ({
                        ...p,
                        maxRuleLength: normalizeOptionalInteger(p.maxRuleLength, { min: 1 }),
                      }));
                    }}
                  />
                  <Input
                    label="Max Active Rules per User"
                    type="number"
                    value={settings.maxActiveRules ?? ''}
                    onChange={(e) => {
                      setSettings((p) => ({
                        ...p,
                        maxActiveRules: parseOptionalIntegerInput(e.target.value, p.maxActiveRules),
                      }));
                    }}
                    onBlur={() => {
                      setSettings((p) => ({
                        ...p,
                        maxActiveRules: normalizeOptionalInteger(p.maxActiveRules, { min: 1 }),
                      }));
                    }}
                    hint="Maximum number of active rules a non-admin user can have (default: 3)."
                  />
                  <Input
                    label="Max Response Tokens"
                    type="number"
                    value={settings.llmMaxTokens ?? ''}
                    onChange={(e) => {
                      setSettings((p) => ({
                        ...p,
                        llmMaxTokens: parseOptionalIntegerInput(e.target.value, p.llmMaxTokens),
                      }));
                    }}
                    onBlur={() => {
                      setSettings((p) => ({
                        ...p,
                        llmMaxTokens: normalizeOptionalInteger(p.llmMaxTokens, { min: 1 }),
                      }));
                    }}
                    hint="Maximum number of tokens the LLM can return per email (default: 4000). Increase for long HTML emails."
                  />
                  <Textarea
                    label="System Prompt (base)"
                    value={settings.llmSystemPrompt || ''}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, llmSystemPrompt: e.target.value }))
                    }
                    rows={8}
                    placeholder="Leave empty to use the default Postino system prompt. User rules are always appended automatically."
                    hint="This is the base system prompt sent to the LLM. User-specific rules are appended automatically per email."
                  />
                  <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Parallel Rule Execution
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        When enabled, all matching rules are applied in a single LLM call instead of
                        one call per rule. Reduces token usage and latency, but the LLM must honour
                        all rules simultaneously.
                      </p>
                    </div>
                    <Switch
                      id="rules-execution-mode"
                      checked={settings.rulesExecutionMode === 'parallel'}
                      onCheckedChange={(checked) =>
                        setSettings((p) => ({
                          ...p,
                          rulesExecutionMode: checked ? 'parallel' : 'sequential',
                        }))
                      }
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="agent">
              <AccordionTrigger>Agent Settings</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Enable Agent Tracing
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Stores a step-by-step execution trace for each processed email and shows it
                        in Admin Email Logs.
                      </p>
                    </div>
                    <Switch
                      id="agent-tracing-enabled"
                      checked={settings.agentTracingEnabled !== false}
                      onCheckedChange={(checked) =>
                        setSettings((p) => ({ ...p, agentTracingEnabled: checked }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Include Prompt/Response Excerpts
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Adds short excerpts of prompts and model outputs to traces for deeper
                        debugging. Disabled by default.
                      </p>
                    </div>
                    <Switch
                      id="agent-trace-include-excerpts"
                      checked={settings.agentTraceIncludeExcerpts === true}
                      onCheckedChange={(checked) =>
                        setSettings((p) => ({ ...p, agentTraceIncludeExcerpts: checked }))
                      }
                    />
                  </div>

                  <Input
                    label="Chunk Threshold (chars)"
                    type="number"
                    min={AGENT_LIMITS.chunkThresholdChars.min}
                    max={AGENT_LIMITS.chunkThresholdChars.max}
                    value={settings.agentChunkThresholdChars ?? ''}
                    onChange={(e) => {
                      setSettings((p) => ({
                        ...p,
                        agentChunkThresholdChars: parseOptionalIntegerInput(
                          e.target.value,
                          p.agentChunkThresholdChars,
                        ),
                      }));
                    }}
                    onBlur={() => {
                      setSettings((p) => ({
                        ...p,
                        agentChunkThresholdChars: normalizeOptionalInteger(
                          p.agentChunkThresholdChars,
                          {
                            min: AGENT_LIMITS.chunkThresholdChars.min,
                            max: AGENT_LIMITS.chunkThresholdChars.max,
                          },
                        ),
                      }));
                    }}
                    hint={`If email body length exceeds this value, the agent switches to chunked map-reduce mode (${AGENT_LIMITS.chunkThresholdChars.min}-${AGENT_LIMITS.chunkThresholdChars.max}).`}
                  />
                  <Input
                    label="Chunk Size (chars)"
                    type="number"
                    min={AGENT_LIMITS.chunkSizeChars.min}
                    max={AGENT_LIMITS.chunkSizeChars.max}
                    value={settings.agentChunkSizeChars ?? ''}
                    onChange={(e) => {
                      setSettings((p) => ({
                        ...p,
                        agentChunkSizeChars: parseOptionalIntegerInput(
                          e.target.value,
                          p.agentChunkSizeChars,
                        ),
                      }));
                    }}
                    onBlur={() => {
                      setSettings((p) => ({
                        ...p,
                        agentChunkSizeChars: normalizeOptionalInteger(p.agentChunkSizeChars, {
                          min: AGENT_LIMITS.chunkSizeChars.min,
                          max: AGENT_LIMITS.chunkSizeChars.max,
                        }),
                      }));
                    }}
                    hint={`Target size for each map-phase chunk (${AGENT_LIMITS.chunkSizeChars.min}-${AGENT_LIMITS.chunkSizeChars.max}).`}
                  />
                  <Input
                    label="Chunk Extract Max Tokens"
                    type="number"
                    min={AGENT_LIMITS.chunkExtractMaxTokens.min}
                    max={AGENT_LIMITS.chunkExtractMaxTokens.max}
                    value={settings.agentChunkExtractMaxTokens ?? ''}
                    onChange={(e) => {
                      setSettings((p) => ({
                        ...p,
                        agentChunkExtractMaxTokens: parseOptionalIntegerInput(
                          e.target.value,
                          p.agentChunkExtractMaxTokens,
                        ),
                      }));
                    }}
                    onBlur={() => {
                      setSettings((p) => ({
                        ...p,
                        agentChunkExtractMaxTokens: normalizeOptionalInteger(
                          p.agentChunkExtractMaxTokens,
                          {
                            min: AGENT_LIMITS.chunkExtractMaxTokens.min,
                            max: AGENT_LIMITS.chunkExtractMaxTokens.max,
                          },
                        ),
                      }));
                    }}
                    hint={`Max tokens for each chunk extraction LLM call (${AGENT_LIMITS.chunkExtractMaxTokens.min}-${AGENT_LIMITS.chunkExtractMaxTokens.max}).`}
                  />
                  <Input
                    label="Pre-analysis Max Tokens"
                    type="number"
                    min={AGENT_LIMITS.analysisMaxTokens.min}
                    max={AGENT_LIMITS.analysisMaxTokens.max}
                    value={settings.agentAnalysisMaxTokens ?? ''}
                    onChange={(e) => {
                      setSettings((p) => ({
                        ...p,
                        agentAnalysisMaxTokens: parseOptionalIntegerInput(
                          e.target.value,
                          p.agentAnalysisMaxTokens,
                        ),
                      }));
                    }}
                    onBlur={() => {
                      setSettings((p) => ({
                        ...p,
                        agentAnalysisMaxTokens: normalizeOptionalInteger(p.agentAnalysisMaxTokens, {
                          min: AGENT_LIMITS.analysisMaxTokens.min,
                          max: AGENT_LIMITS.analysisMaxTokens.max,
                        }),
                      }));
                    }}
                    hint={`Max tokens for pre-analysis classification call (${AGENT_LIMITS.analysisMaxTokens.min}-${AGENT_LIMITS.analysisMaxTokens.max}).`}
                  />
                  <Input
                    label="Pre-analysis Body Max Chars"
                    type="number"
                    min={AGENT_LIMITS.bodyAnalysisMaxChars.min}
                    max={AGENT_LIMITS.bodyAnalysisMaxChars.max}
                    value={settings.agentBodyAnalysisMaxChars ?? ''}
                    onChange={(e) => {
                      setSettings((p) => ({
                        ...p,
                        agentBodyAnalysisMaxChars: parseOptionalIntegerInput(
                          e.target.value,
                          p.agentBodyAnalysisMaxChars,
                        ),
                      }));
                    }}
                    onBlur={() => {
                      setSettings((p) => ({
                        ...p,
                        agentBodyAnalysisMaxChars: normalizeOptionalInteger(
                          p.agentBodyAnalysisMaxChars,
                          {
                            min: AGENT_LIMITS.bodyAnalysisMaxChars.min,
                            max: AGENT_LIMITS.bodyAnalysisMaxChars.max,
                          },
                        ),
                      }));
                    }}
                    hint={`Max Markdown characters sent to pre-analysis after HTML cleanup/extraction (${AGENT_LIMITS.bodyAnalysisMaxChars.min}-${AGENT_LIMITS.bodyAnalysisMaxChars.max}). HTML emails are converted to structured text before this limit is applied.`}
                  />
                  <Input
                    label="Chunk Fallback Max Chars"
                    type="number"
                    min={AGENT_LIMITS.chunkFallbackMaxChars.min}
                    max={AGENT_LIMITS.chunkFallbackMaxChars.max}
                    value={settings.agentChunkFallbackMaxChars ?? ''}
                    onChange={(e) => {
                      setSettings((p) => ({
                        ...p,
                        agentChunkFallbackMaxChars: parseOptionalIntegerInput(
                          e.target.value,
                          p.agentChunkFallbackMaxChars,
                        ),
                      }));
                    }}
                    onBlur={() => {
                      setSettings((p) => ({
                        ...p,
                        agentChunkFallbackMaxChars: normalizeOptionalInteger(
                          p.agentChunkFallbackMaxChars,
                          {
                            min: AGENT_LIMITS.chunkFallbackMaxChars.min,
                            max: AGENT_LIMITS.chunkFallbackMaxChars.max,
                          },
                        ),
                      }));
                    }}
                    hint={`If chunk extraction fails, raw chunk is truncated to this length (${AGENT_LIMITS.chunkFallbackMaxChars.min}-${AGENT_LIMITS.chunkFallbackMaxChars.max}).`}
                  />
                  <Input
                    label="Fallback Pass Max Tokens"
                    type="number"
                    min={AGENT_LIMITS.fallbackPassMaxTokens.min}
                    max={AGENT_LIMITS.fallbackPassMaxTokens.max}
                    value={settings.agentFallbackMaxTokens ?? ''}
                    onChange={(e) => {
                      setSettings((p) => ({
                        ...p,
                        agentFallbackMaxTokens: parseOptionalIntegerInput(
                          e.target.value,
                          p.agentFallbackMaxTokens,
                        ),
                      }));
                    }}
                    onBlur={() => {
                      setSettings((p) => ({
                        ...p,
                        agentFallbackMaxTokens: normalizeOptionalInteger(p.agentFallbackMaxTokens, {
                          min: AGENT_LIMITS.fallbackPassMaxTokens.min,
                          max: AGENT_LIMITS.fallbackPassMaxTokens.max,
                        }),
                      }));
                    }}
                    hint={`Max tokens used by low-complexity fallback pass after a primary failure (${AGENT_LIMITS.fallbackPassMaxTokens.min}-${AGENT_LIMITS.fallbackPassMaxTokens.max}).`}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="smtp">
              <AccordionTrigger>Email Settings</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <Input
                    label="Email Domain"
                    value={settings.emailDomain || ''}
                    onChange={(e) => setSettings((p) => ({ ...p, emailDomain: e.target.value }))}
                    placeholder="sandbox.postino.pro"
                    hint="Domain used for generating user email addresses"
                  />
                  <Input
                    label="Default Subject Prefix"
                    value={settings.emailSubjectPrefix || ''}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, emailSubjectPrefix: e.target.value }))
                    }
                    placeholder="[Postino]"
                    hint="Used when the LLM does not return a subject. Leave empty to disable prefixing."
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="SMTP Host"
                      value={settings.smtpHost || ''}
                      onChange={(e) => setSettings((p) => ({ ...p, smtpHost: e.target.value }))}
                      placeholder="smtp.gmail.com"
                    />
                    <Input
                      label="SMTP Port"
                      type="number"
                      min={1}
                      max={65535}
                      value={settings.smtpPort ?? ''}
                      onChange={(e) => {
                        setSettings((p) => ({
                          ...p,
                          smtpPort: parseOptionalIntegerInput(e.target.value, p.smtpPort),
                        }));
                      }}
                      onBlur={() => {
                        setSettings((p) => ({
                          ...p,
                          smtpPort: normalizeOptionalInteger(p.smtpPort, { min: 1, max: 65535 }),
                        }));
                      }}
                    />
                  </div>
                  <Input
                    label="SMTP Username"
                    value={settings.smtpUser || ''}
                    onChange={(e) => setSettings((p) => ({ ...p, smtpUser: e.target.value }))}
                  />
                  <Input
                    label="SMTP Password"
                    type="password"
                    value={settings.smtpPass || ''}
                    onChange={(e) => setSettings((p) => ({ ...p, smtpPass: e.target.value }))}
                  />
                  <Input
                    label="Sender Name"
                    value={settings.smtpFromName || ''}
                    onChange={(e) => setSettings((p) => ({ ...p, smtpFromName: e.target.value }))}
                    placeholder="📬 Postino"
                    hint="Use {senderName} to include the original sender's display name, e.g. 📬 Postino x {senderName}"
                  />
                  <Input
                    label="Sender Email Address"
                    value={settings.smtpFromEmail || ''}
                    onChange={(e) => setSettings((p) => ({ ...p, smtpFromEmail: e.target.value }))}
                    placeholder="noreply@postino.pro"
                    hint="The email address shown in the From field. Replaces the legacy From Address setting when provided."
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="mailgun">
              <AccordionTrigger>Mailgun Settings</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <Input
                    label="Mailgun API Key"
                    type="password"
                    value={settings.mailgunApiKey || ''}
                    onChange={(e) => setSettings((p) => ({ ...p, mailgunApiKey: e.target.value }))}
                    placeholder="key-..."
                  />
                  <Input
                    label="Mailgun Webhook Signing Key"
                    type="password"
                    value={settings.mailgunWebhookSigningKey || ''}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, mailgunWebhookSigningKey: e.target.value }))
                    }
                    placeholder="webhook signing key"
                    hint="Used to verify inbound Mailgun webhook signatures"
                  />
                  <Input
                    label="Mailgun Domain"
                    value={settings.mailgunDomain || ''}
                    onChange={(e) => setSettings((p) => ({ ...p, mailgunDomain: e.target.value }))}
                    placeholder="sandbox....mailgun.org"
                  />
                  <Input
                    label="Mailgun Sandbox Email"
                    value={settings.mailgunSandboxEmail || ''}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, mailgunSandboxEmail: e.target.value }))
                    }
                    placeholder="sandbox123.mailgun.org"
                    hint="Used when recipient arrives without @domain"
                  />
                  <Input
                    label="Mailgun Base URL"
                    value={settings.mailgunBaseUrl || ''}
                    onChange={(e) => setSettings((p) => ({ ...p, mailgunBaseUrl: e.target.value }))}
                    placeholder="https://api.mailgun.net"
                    hint="US region: https://api.mailgun.net · EU region: https://api.eu.mailgun.net"
                  />
                  {showMailgunRegionWarning && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Domain appears to be EU-based. Use https://api.eu.mailgun.net as Mailgun Base
                      URL to avoid stored message fetch failures.
                    </p>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="mailgun-test-to">Test Recipient Email</Label>
                    <div className="min-w-0">
                      <Input
                        id="mailgun-test-to"
                        type="email"
                        value={mailgunTestTo}
                        onChange={(e) => setMailgunTestTo(e.target.value)}
                        placeholder="admin@yourdomain.com"
                        hint="Leave empty to send to the currently logged-in admin email"
                      />
                    </div>
                    <div>
                      <Button
                        variant="secondary"
                        onClick={handleTestMailgun}
                        loading={mailgunTesting}
                      >
                        Send test email
                      </Button>
                    </div>
                    {mailgunTestResult && (
                      <div
                        className={cn(
                          'text-sm flex flex-col gap-0.5',
                          mailgunTestResult.ok
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400',
                        )}
                      >
                        <span className="flex items-center gap-1">
                          {mailgunTestResult.ok ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : (
                            <AlertCircle className="h-4 w-4" />
                          )}
                          {mailgunTestResult.message}
                        </span>
                        {mailgunTestResult.detail && (
                          <span className="text-xs opacity-75 font-mono wrap-break-word">
                            {mailgunTestResult.detail}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="memory">
              <AccordionTrigger>Memory Settings</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Enable Memory (Supermemory.ai)
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        When enabled, processed emails are saved to Supermemory.ai and users get
                        access to the Agent tab to query their memories in natural language.
                      </p>
                    </div>
                    <Switch
                      id="memory-enabled"
                      checked={settings.memoryEnabled === true}
                      onCheckedChange={(checked) =>
                        setSettings((p) => ({ ...p, memoryEnabled: checked }))
                      }
                    />
                  </div>
                  {settings.memoryEnabled && (
                    <Input
                      label="Supermemory API Key"
                      type="password"
                      value={settings.memoryApiKey || ''}
                      onChange={(e) => setSettings((p) => ({ ...p, memoryApiKey: e.target.value }))}
                      placeholder="sm-..."
                      hint="API key from console.supermemory.ai. Falls back to SUPERMEMORY_API_KEY environment variable."
                    />
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} loading={saving}>
          Save Settings
        </Button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-green-600 dark:text-green-300">
            <CheckCircle className="h-4 w-4" /> Settings saved!
          </span>
        )}
      </div>

      {saveError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
