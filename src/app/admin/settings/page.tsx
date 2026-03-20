'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/Card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/Accordion';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { Label } from '@/components/ui/Label';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { Separator } from '@/components/ui/Separator';
import { AlertCircle, CheckCircle } from 'lucide-react';
import type { Settings } from '@/types';

interface OpenRouterModel {
  id: string;
  name: string;
}

interface AdminSettingsPageProps {
  showPageHeader?: boolean;
}

export default function AdminSettingsPage({ showPageHeader = true }: AdminSettingsPageProps) {
  const { firebaseUser } = useAuth();
  const [settings, setSettings] = useState<Partial<Settings>>({
    maxRuleLength: 1000,
    llmModel: 'openai/gpt-4o-mini',
    llmApiKey: '',
    llmMaxTokens: 4000,
    llmSystemPrompt: '',
    emailSubjectPrefix: '[Postino]',
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    emailDomain: '',
    mailgunApiKey: '',
    mailgunWebhookSigningKey: '',
    mailgunDomain: '',
    mailgunSandboxEmail: '',
    mailgunBaseUrl: 'https://api.mailgun.net',
    maintenanceMode: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [llmTesting, setLlmTesting] = useState(false);
  const [llmTestResult, setLlmTestResult] = useState<{ ok: boolean; message: string; detail?: string } | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      if (!firebaseUser) return;
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch('/api/admin/settings', { headers: { Authorization: `Bearer ${token}` } });
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
        const res = await fetch('/api/admin/openrouter-models', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok) { setModels([]); setModelsError(data.error || 'Failed to load models'); return; }
        setModels((data.models || []) as OpenRouterModel[]);
      } catch {
        setModels([]); setModelsError('Failed to load models');
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
      const res = await fetch('/api/admin/test-llm', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.chatCompletion === 'ok') {
        setLlmTestResult({ ok: true, message: `Connection successful — model: ${data.model}`, detail: data.chatResponse });
      } else {
        setLlmTestResult({ ok: false, message: 'Connection failed', detail: data.chatError || JSON.stringify(data) });
      }
    } catch (err) {
      setLlmTestResult({ ok: false, message: 'Request failed', detail: err instanceof Error ? err.message : String(err) });
    } finally {
      setLlmTesting(false);
    }
  };

  const handleSave = async () => {
    if (!firebaseUser) return;
    setSaving(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
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
      icon: <span title="Currently saved model" className="text-amber-500">★</span>,
    });
  }
  models.forEach((m) => modelOptions.push({ value: m.id, label: `${m.name} (${m.id})` }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-[#EFD957] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {showPageHeader && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Platform Settings</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Configure Postino&apos;s core settings</p>
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
                onCheckedChange={(checked) => setSettings((p) => ({ ...p, maintenanceMode: checked }))}
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
          </div>

          <Separator className="mt-6" />

          <Accordion type="multiple">
            <AccordionItem value="llm">
              <AccordionTrigger>AI / LLM Settings</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <Input
                    label="OpenRouter API Key"
                    type="password"
                    value={settings.llmApiKey || ''}
                    onChange={(e) => setSettings((p) => ({ ...p, llmApiKey: e.target.value }))}
                    placeholder="sk-or-..."
                  />
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
                      <p className="text-xs text-gray-500 dark:text-gray-400">Fetched live from OpenRouter</p>
                    )}
                  </div>
                  <Input
                    label="Max Rule Length (characters)"
                    type="number"
                    value={settings.maxRuleLength || 1000}
                    onChange={(e) => setSettings((p) => ({ ...p, maxRuleLength: parseInt(e.target.value) }))}
                  />
                  <Input
                    label="Max Response Tokens"
                    type="number"
                    value={settings.llmMaxTokens || 4000}
                    onChange={(e) => setSettings((p) => ({ ...p, llmMaxTokens: parseInt(e.target.value) }))}
                    hint="Maximum number of tokens the LLM can return per email (default: 4000). Increase for long HTML emails."
                  />
                  <Textarea
                    label="System Prompt (base)"
                    value={settings.llmSystemPrompt || ''}
                    onChange={(e) => setSettings((p) => ({ ...p, llmSystemPrompt: e.target.value }))}
                    rows={8}
                    placeholder="Leave empty to use the default Postino system prompt. User rules are always appended automatically."
                    hint="This is the base system prompt sent to the LLM. User-specific rules are appended automatically per email."
                  />
                  <Input
                    label="Default Subject Prefix"
                    value={settings.emailSubjectPrefix || ''}
                    onChange={(e) => setSettings((p) => ({ ...p, emailSubjectPrefix: e.target.value }))}
                    placeholder="[Postino]"
                    hint="Used when the LLM does not return a subject. Leave empty to disable prefixing."
                  />
                  <Separator />
                  <div className="flex items-center gap-3">
                    <Button onClick={handleTestLlm} loading={llmTesting} variant="secondary">
                      Test Connection
                    </Button>
                    {llmTestResult && (
                      <div className={`text-sm flex flex-col gap-0.5 ${llmTestResult.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        <span className="flex items-center gap-1">
                          {llmTestResult.ok ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                          {llmTestResult.message}
                        </span>
                        {llmTestResult.detail && (
                          <span className="text-xs opacity-75 font-mono">{llmTestResult.detail}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="domain">
              <AccordionTrigger>Email Domain</AccordionTrigger>
              <AccordionContent>
                <Input
                  label="Email Domain"
                  value={settings.emailDomain || ''}
                  onChange={(e) => setSettings((p) => ({ ...p, emailDomain: e.target.value }))}
                  placeholder="sandbox.postino.pro"
                  hint="Domain used for generating user email addresses"
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="smtp">
              <AccordionTrigger>SMTP Settings</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
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
                      value={settings.smtpPort || 587}
                      onChange={(e) => setSettings((p) => ({ ...p, smtpPort: parseInt(e.target.value) }))}
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
                    label="From Address"
                    value={settings.smtpFrom || ''}
                    onChange={(e) => setSettings((p) => ({ ...p, smtpFrom: e.target.value }))}
                    placeholder="Postino <noreply@postino.pro>"
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
                    onChange={(e) => setSettings((p) => ({ ...p, mailgunWebhookSigningKey: e.target.value }))}
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
                    onChange={(e) => setSettings((p) => ({ ...p, mailgunSandboxEmail: e.target.value }))}
                    placeholder="sandbox123.mailgun.org"
                    hint="Used when recipient arrives without @domain"
                  />
                  <Input
                    label="Mailgun Base URL"
                    value={settings.mailgunBaseUrl || ''}
                    onChange={(e) => setSettings((p) => ({ ...p, mailgunBaseUrl: e.target.value }))}
                    placeholder="https://api.mailgun.net"
                  />
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
    </div>
  );
}
