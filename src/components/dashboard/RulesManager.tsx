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
import { useI18n } from '@/lib/i18n';
import { Plus, Filter, Pencil, Trash2, AlertCircle, ChevronUp, ChevronDown, X, Search } from 'lucide-react';

const DEFAULT_MAX_LENGTH = 1000;
const MAX_RULE_NAME_LENGTH = 100;
const MAX_PATTERN_LENGTH = 200;

interface RulesManagerProps {
  maxRuleLength?: number;
  editRuleId?: string;
}

export function RulesManager({ maxRuleLength = DEFAULT_MAX_LENGTH, editRuleId }: RulesManagerProps) {
  const { rules, loading, createRule, updateRule, deleteRule, reorderRules } = useRules();
  const { t, locale } = useI18n();

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
  const [searchQuery, setSearchQuery] = useState('');

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
    if (!newRuleName.trim()) { setError(t.dashboard.rules.errors.nameRequired); return; }
    if (newRuleName.trim().length > MAX_RULE_NAME_LENGTH) {
      setError(t.dashboard.rules.errors.nameTooLong.replace('{max}', MAX_RULE_NAME_LENGTH.toString())); return;
    }
    if (!newRuleText.trim()) { setError(t.dashboard.rules.errors.textRequired); return; }
    if (newRuleText.length > maxRuleLength) {
      setError(t.dashboard.rules.errors.textTooLong.replace('{max}', maxRuleLength.toString())); return;
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
      setError(err instanceof Error ? err.message : t.dashboard.rules.errors.failedToCreate);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) { setError(t.dashboard.rules.errors.nameRequired); return; }
    if (editName.trim().length > MAX_RULE_NAME_LENGTH) {
      setError(t.dashboard.rules.errors.nameTooLong.replace('{max}', MAX_RULE_NAME_LENGTH.toString())); return;
    }
    if (!editText.trim()) { setError(t.dashboard.rules.errors.textRequired); return; }
    setSubmitting(true);
    setError('');
    try {
      const rule = rules.find((r) => r.id === id);
      await updateRule(
        id, editName.trim(), editText.trim(), rule?.isActive ?? true,
        editMatchSender.trim(),
        editMatchSubject.trim(),
        editMatchBody.trim()
      );
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.dashboard.rules.errors.failedToUpdate);
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

  const filteredRules = searchQuery.trim()
    ? rules.filter((r) => {
        const q = searchQuery.toLowerCase();
        return (
          r.name.toLowerCase().includes(q) ||
          r.text.toLowerCase().includes(q) ||
          (r.matchSender ?? '').toLowerCase().includes(q) ||
          (r.matchSubject ?? '').toLowerCase().includes(q) ||
          (r.matchBody ?? '').toLowerCase().includes(q)
        );
      })
    : rules;

  return (
    <div className="space-y-6">
      {/* Header card with Add Rule button */}
      <Card>
        <CardContent className="py-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t.dashboard.rules.yourRules}{' '}
            {loading ? (
              <span className="inline-block h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded align-middle animate-pulse" />
            ) : (
              <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                ({rules.filter((r) => r.isActive).length} {t.dashboard.rules.active.toLowerCase()})
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {t.dashboard.rules.appliedTopToBottom} {t.dashboard.rules.useArrows}
          </p>
          {!showAddForm && (
            <div className="flex items-center gap-2 mt-3">
              {rules.length > 0 && (
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t.dashboard.rules.searchPlaceholder}
                    className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0"
                  />
                </div>
              )}
              <Button onClick={() => { setShowAddForm(true); setError(''); }} className="shrink-0">
                <Plus className="h-4 w-4 mr-1.5" />
                {t.dashboard.rules.addARule}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {showAddForm && (
        <Card className="mb-3">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t.dashboard.rules.newRule}</h3>
              <button
                type="button"
                onClick={resetAddForm}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                title={t.dashboard.rules.close}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-rule-name">
                  {t.dashboard.rules.ruleName} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="new-rule-name"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  placeholder={t.dashboard.rules.ruleNamePlaceholder}
                  maxLength={MAX_RULE_NAME_LENGTH}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-rule-description">
                  {t.dashboard.rules.ruleDescription} <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="new-rule-description"
                  value={newRuleText}
                  onChange={(e) => setNewRuleText(e.target.value)}
                  placeholder={t.dashboard.rules.ruleDescriptionPlaceholder}
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
                  {showNewFilters ? t.dashboard.rules.hideFilters : t.dashboard.rules.addFilters}
                </button>
              </div>

              {showNewFilters && (
                <div className="space-y-3 pl-3 border-l-2 border-indigo-100 dark:border-indigo-900">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t.dashboard.rules.filterHelp}
                  </p>
                  <Input
                    label={t.dashboard.rules.senderContains}
                    value={newMatchSender}
                    onChange={(e) => setNewMatchSender(e.target.value)}
                    placeholder={t.dashboard.rules.senderPlaceholder}
                    maxLength={MAX_PATTERN_LENGTH}
                  />
                  <Input
                    label={t.dashboard.rules.subjectContains}
                    value={newMatchSubject}
                    onChange={(e) => setNewMatchSubject(e.target.value)}
                    placeholder={t.dashboard.rules.subjectPlaceholder}
                    maxLength={MAX_PATTERN_LENGTH}
                  />
                  <Input
                    label={t.dashboard.rules.bodyContains}
                    value={newMatchBody}
                    onChange={(e) => setNewMatchBody(e.target.value)}
                    placeholder={t.dashboard.rules.bodyPlaceholder}
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
                  {t.dashboard.rules.addRule}
                </Button>
                <Button
                  variant="ghost"
                  onClick={resetAddForm}
                  disabled={submitting}
                >
                  {t.dashboard.rules.cancel}
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
              <p className="text-gray-500 dark:text-gray-400">{t.dashboard.rules.noRulesYet}</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                {t.dashboard.rules.exampleRule}
              </p>
            </CardContent>
          </Card>
        ) : filteredRules.length === 0 ? (
          <Card>
            <CardContent className="text-center py-10">
              <p className="text-gray-500 dark:text-gray-400">{t.dashboard.rules.noMatchingRules}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredRules.map((rule) => {
              const index = rules.findIndex((r) => r.id === rule.id);
              return (
              <div key={rule.id} ref={rule.id === editingId ? editRuleRef : undefined}>
                <Card className={!rule.isActive ? 'opacity-60' : ''}>
                  <CardContent className="py-4">
                    {editingId === rule.id ? (
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <Label htmlFor={`edit-name-${rule.id}`}>
                            {t.dashboard.rules.ruleName} <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id={`edit-name-${rule.id}`}
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder={t.dashboard.rules.ruleNamePlaceholder}
                            maxLength={MAX_RULE_NAME_LENGTH}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`edit-desc-${rule.id}`}>
                            {t.dashboard.rules.ruleDescription} <span className="text-red-500">*</span>
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
                            {showEditFilters ? t.dashboard.rules.hideFilters : t.dashboard.rules.editFilters}
                          </button>
                        </div>
                        {showEditFilters && (
                          <div className="space-y-3 pl-3 border-l-2 border-indigo-100 dark:border-indigo-900">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {t.dashboard.rules.filterHelp}
                            </p>
                            <Input
                              label={t.dashboard.rules.senderContains}
                              value={editMatchSender}
                              onChange={(e) => setEditMatchSender(e.target.value)}
                              placeholder={t.dashboard.rules.senderPlaceholder}
                              maxLength={MAX_PATTERN_LENGTH}
                            />
                            <Input
                              label={t.dashboard.rules.subjectContains}
                              value={editMatchSubject}
                              onChange={(e) => setEditMatchSubject(e.target.value)}
                              placeholder={t.dashboard.rules.subjectPlaceholder}
                              maxLength={MAX_PATTERN_LENGTH}
                            />
                            <Input
                              label={t.dashboard.rules.bodyContains}
                              value={editMatchBody}
                              onChange={(e) => setEditMatchBody(e.target.value)}
                              placeholder={t.dashboard.rules.bodyPlaceholder}
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
                            {t.dashboard.rules.saveChanges}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setError(''); }}>
                            {t.dashboard.rules.cancel}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {/* Top row: order badge + name + active toggle */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {rules.length > 1 && (
                              <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-semibold rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 shrink-0" title={t.dashboard.rules.processingOrder}>
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
                              {rule.isActive ? t.dashboard.rules.active : t.dashboard.rules.disabled}
                            </Label>
                          </div>
                        </div>

                        {/* Rule body */}
                        <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap mb-2">{rule.text}</p>
                        {(rule.matchSender || rule.matchSubject || rule.matchBody) && (
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {rule.matchSender && (
                              <span className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                                <span className="font-medium">{t.dashboard.rules.sender}</span> {rule.matchSender}
                              </span>
                            )}
                            {rule.matchSubject && (
                              <span className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                                <span className="font-medium">{t.dashboard.rules.subject}</span> {rule.matchSubject}
                              </span>
                            )}
                            {rule.matchBody && (
                              <span className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                                <span className="font-medium">{t.dashboard.rules.body}</span> {rule.matchBody}
                              </span>
                            )}
                          </div>
                        )}
                        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                          {t.dashboard.rules.updated} {formatDate(rule.updatedAt, locale)}
                        </p>

                        {/* Bottom row: up/down arrows (left) + edit/delete (right) */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => moveRule(index, 'up')}
                              disabled={index === 0 || reordering}
                              title={t.dashboard.rules.moveRuleUp}
                              className="px-1.5"
                            >
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => moveRule(index, 'down')}
                              disabled={index === rules.length - 1 || reordering}
                              title={t.dashboard.rules.moveRuleDown}
                              className="px-1.5"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button size="sm" variant="ghost" onClick={() => startEditing(rule.id)} title={t.dashboard.rules.edit}>
                              <Pencil className="h-3.5 w-3.5 mr-1" />
                              {t.dashboard.rules.edit}
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => setDeleteId(rule.id)} title={t.dashboard.rules.deleteRule}>
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              {t.dashboard.rules.delete}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Drawer */}
      <Drawer open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{t.dashboard.rules.deleteRule}</DrawerTitle>
            <DrawerDescription>
              {t.dashboard.rules.deleteConfirm}{' '}
              <span className="font-semibold text-gray-900 dark:text-gray-100">&ldquo;{deleteRuleName}&rdquo;</span>?
              {' '}{t.dashboard.rules.cannotBeUndone}
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <Button variant="ghost" onClick={() => setDeleteId(null)} disabled={deleting}>
              {t.dashboard.rules.cancel}
            </Button>
            <Button variant="danger" onClick={handleDeleteConfirm} loading={deleting}>
              {t.dashboard.rules.deleteRule}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
