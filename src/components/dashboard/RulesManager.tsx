'use client';

import { useState, useEffect, useRef } from 'react';
import { useRules } from '@/hooks/useRules';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';

const DEFAULT_MAX_LENGTH = 1000;

interface RulesManagerProps {
  maxRuleLength?: number;
  editRuleId?: string;
}

export function RulesManager({ maxRuleLength = DEFAULT_MAX_LENGTH, editRuleId }: RulesManagerProps) {
  const { rules, loading, createRule, updateRule, deleteRule } = useRules();

  // New rule form state
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleText, setNewRuleText] = useState('');
  const [newMatchSender, setNewMatchSender] = useState('');
  const [newMatchSubject, setNewMatchSubject] = useState('');
  const [newMatchBody, setNewMatchBody] = useState('');
  const [showNewFilters, setShowNewFilters] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editText, setEditText] = useState('');
  const [editMatchSender, setEditMatchSender] = useState('');
  const [editMatchSubject, setEditMatchSubject] = useState('');
  const [editMatchBody, setEditMatchBody] = useState('');
  const [showEditFilters, setShowEditFilters] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const editRuleRef = useRef<HTMLDivElement>(null);

  // If editRuleId is provided, open that rule for editing
  useEffect(() => {
    if (editRuleId && !loading && rules.length > 0) {
      const rule = rules.find((r) => r.id === editRuleId);
      if (rule) {
        setEditingId(rule.id);
        setEditName(rule.name);
        setEditText(rule.text);
        setEditMatchSender(rule.matchSender || '');
        setEditMatchSubject(rule.matchSubject || '');
        setEditMatchBody(rule.matchBody || '');
        setShowEditFilters(
          !!(rule.matchSender || rule.matchSubject || rule.matchBody)
        );
        setTimeout(() => {
          editRuleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    }
  }, [editRuleId, loading, rules]);

  const handleCreate = async () => {
    if (!newRuleName.trim()) {
      setError('Rule name is required');
      return;
    }
    if (!newRuleText.trim()) {
      setError('Rule text is required');
      return;
    }
    if (newRuleText.length > maxRuleLength) {
      setError(`Rule exceeds maximum length of ${maxRuleLength} characters`);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await createRule(
        newRuleName.trim(),
        newRuleText.trim(),
        newMatchSender.trim() || undefined,
        newMatchSubject.trim() || undefined,
        newMatchBody.trim() || undefined
      );
      setNewRuleName('');
      setNewRuleText('');
      setNewMatchSender('');
      setNewMatchSubject('');
      setNewMatchBody('');
      setShowNewFilters(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create rule');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) {
      setError('Rule name is required');
      return;
    }
    if (!editText.trim()) {
      setError('Rule text is required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const rule = rules.find((r) => r.id === id);
      await updateRule(
        id,
        editName.trim(),
        editText.trim(),
        rule?.isActive ?? true,
        editMatchSender.trim() || undefined,
        editMatchSubject.trim() || undefined,
        editMatchBody.trim() || undefined
      );
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update rule');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id: string, current: boolean) => {
    const rule = rules.find((r) => r.id === id);
    if (!rule) return;
    await updateRule(id, rule.name, rule.text, !current, rule.matchSender, rule.matchSubject, rule.matchBody);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    await deleteRule(id);
  };

  const startEditing = (id: string) => {
    const rule = rules.find((r) => r.id === id);
    if (!rule) return;
    setEditingId(id);
    setEditName(rule.name);
    setEditText(rule.text);
    setEditMatchSender(rule.matchSender || '');
    setEditMatchSubject(rule.matchSubject || '');
    setEditMatchBody(rule.matchBody || '');
    setShowEditFilters(!!(rule.matchSender || rule.matchSubject || rule.matchBody));
    setError('');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Add New Rule</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Give your rule a name and describe how you want Postino to process your emails.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Rule Name <span className="text-red-500">*</span>
              </label>
              <Input
                value={newRuleName}
                onChange={(e) => setNewRuleName(e.target.value)}
                placeholder="e.g. Newsletter Summarizer"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Rule Description <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={newRuleText}
                onChange={(e) => setNewRuleText(e.target.value)}
                placeholder="Example: Summarize newsletters and remove promotional content. Keep only the key articles and links."
                rows={3}
                charCount={{ current: newRuleText.length, max: maxRuleLength }}
              />
            </div>

            <div>
              <button
                type="button"
                className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                onClick={() => setShowNewFilters((v) => !v)}
              >
                {showNewFilters ? '▾ Hide filters' : '▸ Add sender/subject/body filters (optional)'}
              </button>
            </div>

            {showNewFilters && (
              <div className="space-y-2 pl-2 border-l-2 border-indigo-100 dark:border-indigo-900">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Apply this rule only when the incoming email matches all provided patterns (case-insensitive contains). Leave blank to apply to all emails.
                </p>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Sender contains</label>
                  <Input
                    value={newMatchSender}
                    onChange={(e) => setNewMatchSender(e.target.value)}
                    placeholder="e.g. newsletter@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Subject contains</label>
                  <Input
                    value={newMatchSubject}
                    onChange={(e) => setNewMatchSubject(e.target.value)}
                    placeholder="e.g. Weekly Digest"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Body contains</label>
                  <Input
                    value={newMatchBody}
                    onChange={(e) => setNewMatchBody(e.target.value)}
                    placeholder="e.g. unsubscribe"
                  />
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button
                onClick={handleCreate}
                loading={submitting}
                disabled={!newRuleName.trim() || !newRuleText.trim() || newRuleText.length > maxRuleLength}
              >
                Add Rule
              </Button>
              {(newRuleName || newRuleText) && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setNewRuleName('');
                    setNewRuleText('');
                    setNewMatchSender('');
                    setNewMatchSubject('');
                    setNewMatchBody('');
                    setShowNewFilters(false);
                    setError('');
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Your Rules ({rules.filter((r) => r.isActive).length} active)
        </h2>
        {loading ? (
          <div className="text-center py-8 text-gray-400 dark:text-gray-500">Loading rules...</div>
        ) : rules.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-gray-500 dark:text-gray-400">No rules yet. Add your first rule above!</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                Example: &ldquo;Remove ads and summarize newsletters&rdquo;
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <div key={rule.id} ref={rule.id === editingId ? editRuleRef : undefined}>
              <Card className={!rule.isActive ? 'opacity-60' : ''}>
                <CardContent className="py-4">
                  {editingId === rule.id ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Rule Name <span className="text-red-500">*</span>
                        </label>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="e.g. Newsletter Summarizer"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Rule Description <span className="text-red-500">*</span>
                        </label>
                        <Textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={3}
                          charCount={{ current: editText.length, max: maxRuleLength }}
                        />
                      </div>

                      <div>
                        <button
                          type="button"
                          className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                          onClick={() => setShowEditFilters((v) => !v)}
                        >
                          {showEditFilters ? '▾ Hide filters' : '▸ Edit sender/subject/body filters (optional)'}
                        </button>
                      </div>

                      {showEditFilters && (
                        <div className="space-y-2 pl-2 border-l-2 border-indigo-100 dark:border-indigo-900">
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Apply this rule only when the incoming email matches all provided patterns (case-insensitive contains). Leave blank to apply to all emails.
                          </p>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Sender contains</label>
                            <Input
                              value={editMatchSender}
                              onChange={(e) => setEditMatchSender(e.target.value)}
                              placeholder="e.g. newsletter@example.com"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Subject contains</label>
                            <Input
                              value={editMatchSubject}
                              onChange={(e) => setEditMatchSubject(e.target.value)}
                              placeholder="e.g. Weekly Digest"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Body contains</label>
                            <Input
                              value={editMatchBody}
                              onChange={(e) => setEditMatchBody(e.target.value)}
                              placeholder="e.g. unsubscribe"
                            />
                          </div>
                        </div>
                      )}

                      {error && <p className="text-sm text-red-600">{error}</p>}
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleUpdate(rule.id)} loading={submitting}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setError(''); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{rule.name}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-wrap">{rule.text}</p>
                        {(rule.matchSender || rule.matchSubject || rule.matchBody) && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {rule.matchSender && (
                              <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded">
                                Sender: {rule.matchSender}
                              </span>
                            )}
                            {rule.matchSubject && (
                              <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded">
                                Subject: {rule.matchSubject}
                              </span>
                            )}
                            {rule.matchBody && (
                              <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded">
                                Body: {rule.matchBody}
                              </span>
                            )}
                          </div>
                        )}
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          Updated {formatDate(rule.updatedAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                        <Badge variant={rule.isActive ? 'success' : 'default'}>
                          {rule.isActive ? 'Active' : 'Disabled'}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggle(rule.id, rule.isActive)}
                        >
                          {rule.isActive ? 'Disable' : 'Enable'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEditing(rule.id)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => handleDelete(rule.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
