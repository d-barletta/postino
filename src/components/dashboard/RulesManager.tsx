'use client';

import { useState, useEffect, useRef } from 'react';
import { useRules } from '@/hooks/useRules';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';
import { Switch } from '@/components/ui/Switch';
import { Label } from '@/components/ui/Label';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/Drawer';
import { formatDate } from '@/lib/utils';
import { Plus, Filter, Pencil, Trash2, AlertCircle, ChevronUp, ChevronDown, X } from 'lucide-react';

const DEFAULT_MAX_LENGTH = 1000;
const MAX_RULE_NAME_LENGTH = 100;
const MAX_PATTERN_LENGTH = 200;

interface RulesManagerProps {
  maxRuleLength?: number;
  editRuleId?: string;
}

export function RulesManager({ maxRuleLength = DEFAULT_MAX_LENGTH, editRuleId }: RulesManagerProps) {
  const { rules, loading, createRule, updateRule, deleteRule, reorderRules } = useRules();

  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleText, setNewRuleText] = useState('');
  const [newMatchSender, setNewMatchSender] = useState('');
  const [newMatchSubject, setNewMatchSubject] = useState('');
  const [newMatchBody, setNewMatchBody] = useState('');
  const [showNewFilters, setShowNewFilters] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editText, setEditText] = useState('');
  const [editMatchSender, setEditMatchSender] = useState('');
  const [editMatchSubject, setEditMatchSubject] = useState('');
  const [editMatchBody, setEditMatchBody] = useState('');
  const [showEditFilters, setShowEditFilters] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reordering, setReordering] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const editRuleRef = useRef<HTMLDivElement>(null);

  const resetAddForm = () => {
    setShowAddForm(false);
    setNewRuleName('');
    setNewRuleText('');
    setNewMatchSender('');
    setNewMatchSubject('');
    setNewMatchBody('');
    setShowNewFilters(false);
    setError('');
  };

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
        setShowEditFilters(!!(rule.matchSender || rule.matchSubject || rule.matchBody));
        setTimeout(() => {
          editRuleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    }
  }, [editRuleId, loading, rules]);

  const handleCreate = async () => {
    if (!newRuleName.trim()) { setError('Rule name is required'); return; }
    if (newRuleName.trim().length > MAX_RULE_NAME_LENGTH) {
      setError(`Rule name must be at most ${MAX_RULE_NAME_LENGTH} characters`); return;
    }
    if (!newRuleText.trim()) { setError('Rule text is required'); return; }
    if (newRuleText.length > maxRuleLength) {
      setError(`Rule exceeds maximum length of ${maxRuleLength} characters`); return;
    }
    setSubmitting(true);
    setError('');
    try {
      await createRule(
        newRuleName.trim(), newRuleText.trim(),
        newMatchSender.trim() || undefined,
        newMatchSubject.trim() || undefined,
        newMatchBody.trim() || undefined
      );
      setNewRuleName(''); setNewRuleText('');
      setNewMatchSender(''); setNewMatchSubject(''); setNewMatchBody('');
      setShowNewFilters(false); setShowAddForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create rule');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) { setError('Rule name is required'); return; }
    if (editName.trim().length > MAX_RULE_NAME_LENGTH) {
      setError(`Rule name must be at most ${MAX_RULE_NAME_LENGTH} characters`); return;
    }
    if (!editText.trim()) { setError('Rule text is required'); return; }
    setSubmitting(true);
    setError('');
    try {
      const rule = rules.find((r) => r.id === id);
      await updateRule(
        id, editName.trim(), editText.trim(), rule?.isActive ?? true,
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

  const handleDeleteConfirm = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try { await deleteRule(deleteId); }
    finally { setDeleting(false); setDeleteId(null); }
  };

  const moveRule = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= rules.length) return;
    const newOrder = [...rules];
    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
    setReordering(true);
    try {
      await reorderRules(newOrder.map((r) => r.id));
    } finally {
      setReordering(false);
    }
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

  const deleteRuleName = rules.find((r) => r.id === deleteId)?.name;

  return (
    <div className="space-y-6">
      {/* Add Rule inline section */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Your Rules{' '}
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
              ({rules.filter((r) => r.isActive).length} active)
            </span>
          </h2>
          {rules.length > 1 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Rules are applied top to bottom. Use the arrows to change the order.
            </p>
          )}
        </div>
        {!showAddForm && (
          <Button onClick={() => { setShowAddForm(true); setError(''); }}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add New Rule
          </Button>
        )}
      </div>

      {showAddForm && (
        <Card className="mb-3">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">New Rule</h3>
              <button
                type="button"
                onClick={resetAddForm}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-rule-name">
                  Rule Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="new-rule-name"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  placeholder="e.g. Newsletter Summarizer"
                  maxLength={MAX_RULE_NAME_LENGTH}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-rule-description">
                  Rule Description <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="new-rule-description"
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
                  className="inline-flex items-center gap-1.5 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                  onClick={() => setShowNewFilters((v) => !v)}
                >
                  <Filter className="h-3.5 w-3.5" />
                  {showNewFilters ? 'Hide filters' : 'Add sender/subject/body filters (optional)'}
                </button>
              </div>

              {showNewFilters && (
                <div className="space-y-3 pl-3 border-l-2 border-indigo-100 dark:border-indigo-900">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Apply this rule only when the incoming email matches all provided patterns (case-insensitive contains). Leave blank to apply to all emails.
                  </p>
                  <Input
                    label="Sender contains"
                    value={newMatchSender}
                    onChange={(e) => setNewMatchSender(e.target.value)}
                    placeholder="e.g. newsletter@example.com"
                    maxLength={MAX_PATTERN_LENGTH}
                  />
                  <Input
                    label="Subject contains"
                    value={newMatchSubject}
                    onChange={(e) => setNewMatchSubject(e.target.value)}
                    placeholder="e.g. Weekly Digest"
                    maxLength={MAX_PATTERN_LENGTH}
                  />
                  <Input
                    label="Body contains"
                    value={newMatchBody}
                    onChange={(e) => setNewMatchBody(e.target.value)}
                    placeholder="e.g. unsubscribe"
                    maxLength={MAX_PATTERN_LENGTH}
                  />
                </div>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button
                  onClick={handleCreate}
                  loading={submitting}
                  disabled={!newRuleName.trim() || !newRuleText.trim() || newRuleText.length > maxRuleLength}
                >
                  Add Rule
                </Button>
                <Button
                  variant="ghost"
                  onClick={resetAddForm}
                  disabled={submitting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rules list */}
      <div>
        {loading ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass-panel rounded-xl px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
                    <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded" />
                  </div>
                  <div className="h-7 w-14 bg-gray-200 dark:bg-gray-700 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        ) : rules.length === 0 ? (
          <Card>
            <CardContent className="text-center py-10">
              <p className="text-gray-500 dark:text-gray-400">No rules yet. Add your first rule above!</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                Example: &ldquo;Remove ads and summarize newsletters&rdquo;
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {rules.map((rule, index) => (
              <div key={rule.id} ref={rule.id === editingId ? editRuleRef : undefined}>
                <Card className={!rule.isActive ? 'opacity-60' : ''}>
                  <CardContent className="py-4">
                    {editingId === rule.id ? (
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <Label htmlFor={`edit-name-${rule.id}`}>
                            Rule Name <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id={`edit-name-${rule.id}`}
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="e.g. Newsletter Summarizer"
                            maxLength={MAX_RULE_NAME_LENGTH}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`edit-desc-${rule.id}`}>
                            Rule Description <span className="text-red-500">*</span>
                          </Label>
                          <Textarea
                            id={`edit-desc-${rule.id}`}
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows={3}
                            charCount={{ current: editText.length, max: maxRuleLength }}
                          />
                        </div>
                        <div>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                            onClick={() => setShowEditFilters((v) => !v)}
                          >
                            <Filter className="h-3.5 w-3.5" />
                            {showEditFilters ? 'Hide filters' : 'Edit sender/subject/body filters (optional)'}
                          </button>
                        </div>
                        {showEditFilters && (
                          <div className="space-y-3 pl-3 border-l-2 border-indigo-100 dark:border-indigo-900">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Apply this rule only when the incoming email matches all provided patterns (case-insensitive contains). Leave blank to apply to all emails.
                            </p>
                            <Input
                              label="Sender contains"
                              value={editMatchSender}
                              onChange={(e) => setEditMatchSender(e.target.value)}
                              placeholder="e.g. newsletter@example.com"
                              maxLength={MAX_PATTERN_LENGTH}
                            />
                            <Input
                              label="Subject contains"
                              value={editMatchSubject}
                              onChange={(e) => setEditMatchSubject(e.target.value)}
                              placeholder="e.g. Weekly Digest"
                              maxLength={MAX_PATTERN_LENGTH}
                            />
                            <Input
                              label="Body contains"
                              value={editMatchBody}
                              onChange={(e) => setEditMatchBody(e.target.value)}
                              placeholder="e.g. unsubscribe"
                              maxLength={MAX_PATTERN_LENGTH}
                            />
                          </div>
                        )}
                        {error && (
                          <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                          </Alert>
                        )}
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" onClick={() => handleUpdate(rule.id)} loading={submitting}>
                            Save changes
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setError(''); }}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {/* Top row: order badge + name + active toggle */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {rules.length > 1 && (
                              <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-semibold rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 shrink-0" title="Processing order">
                                {index + 1}
                              </span>
                            )}
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate" title={rule.name}>{rule.name}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Switch
                              id={`toggle-${rule.id}`}
                              checked={rule.isActive}
                              onCheckedChange={() => handleToggle(rule.id, rule.isActive)}
                            />
                            <Label htmlFor={`toggle-${rule.id}`} className="text-xs cursor-pointer whitespace-nowrap">
                              {rule.isActive ? 'Active' : 'Disabled'}
                            </Label>
                          </div>
                        </div>

                        {/* Rule body */}
                        <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap mb-2">{rule.text}</p>
                        {(rule.matchSender || rule.matchSubject || rule.matchBody) && (
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {rule.matchSender && (
                              <span className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                                <span className="font-medium">Sender:</span> {rule.matchSender}
                              </span>
                            )}
                            {rule.matchSubject && (
                              <span className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                                <span className="font-medium">Subject:</span> {rule.matchSubject}
                              </span>
                            )}
                            {rule.matchBody && (
                              <span className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                                <span className="font-medium">Body:</span> {rule.matchBody}
                              </span>
                            )}
                          </div>
                        )}
                        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                          Updated {formatDate(rule.updatedAt)}
                        </p>

                        {/* Bottom row: up/down arrows (left) + edit/delete (right) */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => moveRule(index, 'up')}
                              disabled={index === 0 || reordering}
                              title="Move rule up"
                              className="px-1.5"
                            >
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => moveRule(index, 'down')}
                              disabled={index === rules.length - 1 || reordering}
                              title="Move rule down"
                              className="px-1.5"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button size="sm" variant="ghost" onClick={() => startEditing(rule.id)} title="Edit rule">
                              <Pencil className="h-3.5 w-3.5 mr-1" />
                              Edit
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => setDeleteId(rule.id)} title="Delete rule">
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              Delete
                            </Button>
                          </div>
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

      {/* Delete Confirmation Drawer */}
      <Drawer open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Delete rule</DrawerTitle>
            <DrawerDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold text-gray-900 dark:text-gray-100">&ldquo;{deleteRuleName}&rdquo;</span>?
              This action cannot be undone.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <Button variant="ghost" onClick={() => setDeleteId(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteConfirm} loading={deleting}>
              Delete rule
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
