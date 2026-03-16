'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { Settings } from '@/types';

interface OpenRouterModel {
  id: string;
  name: string;
}

export default function AdminSettingsPage() {
  const { firebaseUser } = useAuth();
  const [settings, setSettings] = useState<Partial<Settings>>({
    maxRuleLength: 1000,
    llmModel: 'openai/gpt-4o-mini',
    llmApiKey: '',
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
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');

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
        const fetchedModels = (data.models || []) as OpenRouterModel[];
        setModels(fetchedModels);
      } catch {
        setModels([]);
        setModelsError('Failed to load models');
      } finally {
        setModelsLoading(false);
      }
    };

    fetchModels();
  }, [firebaseUser]);

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
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading settings...</div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Platform Settings</h1>
        <p className="text-gray-500 mt-1">Configure Postino&apos;s core settings</p>
      </div>

      <Card>
        <CardHeader><h2 className="font-semibold text-gray-900">AI / LLM Settings</h2></CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="OpenRouter API Key"
            type="password"
            value={settings.llmApiKey || ''}
            onChange={(e) => setSettings((p) => ({ ...p, llmApiKey: e.target.value }))}
            placeholder="sk-or-..."
          />
          <div className="space-y-1">
            <label htmlFor="llm-model" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              LLM Model
            </label>
            <div className="relative">
              <select
                id="llm-model"
                className="peer block w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 pr-10 text-sm text-gray-900 shadow-sm focus:border-[#EFD957] focus:outline-none focus:ring-1 focus:ring-[#EFD957] disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:disabled:bg-gray-700 dark:disabled:text-gray-400"
                value={settings.llmModel || ''}
                onChange={(e) => setSettings((p) => ({ ...p, llmModel: e.target.value }))}
                disabled={modelsLoading || models.length === 0}
              >
                {!modelsLoading &&
                  settings.llmModel &&
                  !models.some((model) => model.id === settings.llmModel) && (
                    <option value={settings.llmModel}>{settings.llmModel} (current)</option>
                  )}
                {modelsLoading && <option value="">Loading models...</option>}
                {!modelsLoading && models.length === 0 && (
                  <option value="">No models available</option>
                )}
                {!modelsLoading &&
                  models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} ({model.id})
                    </option>
                  ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-500 dark:text-gray-400 peer-disabled:text-gray-400">
                <i className="bi bi-chevron-down text-xs" aria-hidden="true" />
              </span>
            </div>
            {!modelsError && <p className="text-xs text-gray-500 dark:text-gray-400">Fetched live from OpenRouter</p>}
            {modelsError && <p className="text-xs text-red-600">{modelsError}</p>}
          </div>
          <Input
            label="Max Rule Length (characters)"
            type="number"
            value={settings.maxRuleLength || 1000}
            onChange={(e) => setSettings((p) => ({ ...p, maxRuleLength: parseInt(e.target.value) }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="font-semibold text-gray-900">Email Domain</h2></CardHeader>
        <CardContent>
          <Input
            label="Email Domain"
            value={settings.emailDomain || ''}
            onChange={(e) => setSettings((p) => ({ ...p, emailDomain: e.target.value }))}
            placeholder="sandbox.postino.app"
            hint="Domain used for generating user email addresses"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="font-semibold text-gray-900">SMTP Settings</h2></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
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
            placeholder="Postino <noreply@postino.app>"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="font-semibold text-gray-900">Mailgun Settings</h2></CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} loading={saving}>
          Save Settings
        </Button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-300">
            <i className="bi bi-check-circle-fill" aria-hidden="true" /> Settings saved!
          </span>
        )}
      </div>
    </div>
  );
}
