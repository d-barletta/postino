'use client';

import { useState } from 'react';
import { useRules } from '@/hooks/useRules';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';

const DEFAULT_MAX_LENGTH = 1000;

interface RulesManagerProps {
  maxRuleLength?: number;
}

export function RulesManager({ maxRuleLength = DEFAULT_MAX_LENGTH }: RulesManagerProps) {
  const { rules, loading, createRule, updateRule, deleteRule } = useRules();
  const [newRuleText, setNewRuleText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!newRuleText.trim()) return;
    if (newRuleText.length > maxRuleLength) {
      setError(`Rule exceeds maximum length of ${maxRuleLength} characters`);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await createRule(newRuleText.trim());
      setNewRuleText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create rule');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editText.trim()) return;
    setSubmitting(true);
    try {
      const rule = rules.find((r) => r.id === id);
      await updateRule(id, editText.trim(), rule?.isActive ?? true);
      setEditingId(null);
    } catch {
      setError('Failed to update rule');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id: string, current: boolean) => {
    const rule = rules.find((r) => r.id === id);
    if (!rule) return;
    await updateRule(id, rule.text, !current);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    await deleteRule(id);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Add New Rule</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Describe how you want Postino to process your emails. Be specific!
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Textarea
              value={newRuleText}
              onChange={(e) => setNewRuleText(e.target.value)}
              placeholder="Example: Summarize newsletters and remove promotional content. Keep only the key articles and links."
              rows={3}
              charCount={{ current: newRuleText.length, max: maxRuleLength }}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button
                onClick={handleCreate}
                loading={submitting}
                disabled={!newRuleText.trim() || newRuleText.length > maxRuleLength}
              >
                Add Rule
              </Button>
              {newRuleText && (
                <Button variant="ghost" onClick={() => setNewRuleText('')}>
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
              <Card key={rule.id} className={!rule.isActive ? 'opacity-60' : ''}>
                <CardContent className="py-4">
                  {editingId === rule.id ? (
                    <div className="space-y-3">
                      <Textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        charCount={{ current: editText.length, max: maxRuleLength }}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleUpdate(rule.id)} loading={submitting}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap">{rule.text}</p>
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
                          onClick={() => {
                            setEditingId(rule.id);
                            setEditText(rule.text);
                          }}
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
