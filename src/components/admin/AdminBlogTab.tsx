'use client';

import Image from 'next/image';
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Switch } from '@/components/ui/Switch';
import { Label } from '@/components/ui/Label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { MinimalTiptapEditor } from '@/components/blog/MinimalTiptapEditor';
import { stripDisallowedBlogQuotes } from '@/lib/blog-text';
import { formatDate } from '@/lib/utils';
import { SUPPORTED_LOCALES } from '@/lib/i18n';
import type { BlogArticle } from '@/types';
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  BookOpen,
  X,
  ArrowLeft,
  Languages,
  ChevronDown,
} from 'lucide-react';

interface ArticleFormState {
  title: string;
  content: string;
  tags: string[];
  thumbnailUrl: string;
  published: boolean;
  language: string;
}

const EMPTY_FORM: ArticleFormState = {
  title: '',
  content: '',
  tags: [],
  thumbnailUrl: '',
  published: false,
  language: 'en',
};

type View = 'list' | 'form';

export default function AdminBlogTab() {
  const { authUser, getIdToken } = useAuth();
  const [articles, setArticles] = useState<BlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [view, setView] = useState<View>('list');
  const [editingArticle, setEditingArticle] = useState<BlogArticle | null>(null);
  const [form, setForm] = useState<ArticleFormState>(EMPTY_FORM);
  const [tagInput, setTagInput] = useState('');
  const [translateTarget, setTranslateTarget] = useState('');
  const [showTranslateDropdown, setShowTranslateDropdown] = useState(false);
  const [thumbnailPreviewError, setThumbnailPreviewError] = useState(false);

  const fetchArticles = useCallback(async () => {
    if (!authUser) return;
    try {
      const token = await getIdToken();
      const res = await fetch('/api/admin/blog', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setArticles(
          data.articles.map((a: BlogArticle & { createdAt: string; updatedAt: string }) => ({
            ...a,
            createdAt: new Date(a.createdAt),
            updatedAt: new Date(a.updatedAt),
          })),
        );
      } else {
        toast.error('Failed to load articles');
      }
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const openCreate = () => {
    setEditingArticle(null);
    setForm(EMPTY_FORM);
    setTagInput('');
    setTranslateTarget('');
    setShowTranslateDropdown(false);
    setThumbnailPreviewError(false);
    setView('form');
  };

  const openEdit = (article: BlogArticle) => {
    setEditingArticle(article);
    setForm({
      title: stripDisallowedBlogQuotes(article.title),
      content: article.content,
      tags: article.tags,
      thumbnailUrl: article.thumbnailUrl ?? '',
      published: article.published,
      language: article.language || 'en',
    });
    setTagInput('');
    setTranslateTarget('');
    setShowTranslateDropdown(false);
    setThumbnailPreviewError(false);
    setView('form');
  };

  const goBack = () => {
    setView('list');
    setEditingArticle(null);
    setForm(EMPTY_FORM);
    setTagInput('');
    setTranslateTarget('');
    setShowTranslateDropdown(false);
    setThumbnailPreviewError(false);
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      setForm((f) => ({ ...f, tags: [...f.tags, tag] }));
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));
  };

  const handleSave = async () => {
    if (!authUser) return;
    const sanitizedTitle = stripDisallowedBlogQuotes(form.title).trim();

    if (!sanitizedTitle) {
      toast.error('Title is required');
      return;
    }
    if (!form.content.trim() || form.content === '<p></p>') {
      toast.error('Content is required');
      return;
    }

    setSaving(true);
    try {
      const token = await getIdToken();
      const url = editingArticle ? `/api/admin/blog/${editingArticle.id}` : '/api/admin/blog';
      const method = editingArticle ? 'PUT' : 'POST';

      const payload = {
        ...form,
        title: sanitizedTitle,
        ...(editingArticle?.translationGroupId
          ? { translationGroupId: editingArticle.translationGroupId }
          : {}),
      };

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(editingArticle ? 'Article updated' : 'Article created');
        goBack();
        await fetchArticles();
      } else {
        const data = await res.json();
        toast.error(data.error ?? 'Failed to save article');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (article: BlogArticle) => {
    if (!authUser) return;
    if (!confirm(`Delete article "${article.title}"?`)) return;

    setDeleting(article.id);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/admin/blog/${article.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success('Article deleted');
        await fetchArticles();
      } else {
        toast.error('Failed to delete article');
      }
    } finally {
      setDeleting(null);
    }
  };

  const handleTogglePublish = async (article: BlogArticle) => {
    if (!authUser) return;
    const action = article.published ? 'unpublish' : 'publish';
    if (
      !window.confirm(
        `${action.charAt(0).toUpperCase() + action.slice(1)} article "${article.title}"?`,
      )
    )
      return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/admin/blog/${article.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...article, published: !article.published }),
      });
      if (res.ok) {
        toast.success(article.published ? 'Article unpublished' : 'Article published');
        await fetchArticles();
      } else {
        toast.error('Failed to update article');
      }
    } catch {
      toast.error('Failed to update article');
    }
  };

  const handleTranslate = async () => {
    if (!authUser || !editingArticle || !translateTarget) return;
    setTranslating(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/admin/blog/${editingArticle.id}/translate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targetLanguage: translateTarget }),
      });
      const data = await res.json();
      if (res.ok) {
        const langLabel =
          SUPPORTED_LOCALES.find((l) => l.code === translateTarget)?.label ?? translateTarget;
        toast.success(`Article translated to ${langLabel}`);
        setShowTranslateDropdown(false);
        setTranslateTarget('');
        await fetchArticles();
      } else if (res.status === 409) {
        toast.error('A translation in this language already exists');
      } else {
        toast.error(data.error ?? 'Failed to translate article');
      }
    } finally {
      setTranslating(false);
    }
  };

  const availableTranslateTargets = SUPPORTED_LOCALES.filter(
    (l) => l.code !== (editingArticle?.language || form.language),
  );

  const getLanguageLabel = (code: string) =>
    SUPPORTED_LOCALES.find((l) => l.code === code)?.label ?? code;

  if (view === 'form') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
            Back to list
          </Button>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {editingArticle ? 'Edit Article' : 'New Article'}
          </h2>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-5">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="blog-title">Title</Label>
              <Input
                id="blog-title"
                placeholder="Article title"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    title: stripDisallowedBlogQuotes(e.target.value),
                  }))
                }
              />
            </div>

            {/* Language + Published row */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="blog-language">Language</Label>
                <Select
                  value={form.language}
                  onValueChange={(v) => setForm((f) => ({ ...f, language: v }))}
                >
                  <SelectTrigger id="blog-language">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_LOCALES.map((locale) => (
                      <SelectItem key={locale.code} value={locale.code}>
                        {locale.flag} {locale.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-3 sm:pt-6">
                <Switch
                  id="blog-published"
                  checked={form.published}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, published: v }))}
                />
                <Label htmlFor="blog-published">Published</Label>
              </div>
            </div>

            {/* Thumbnail */}
            <div className="space-y-1.5">
              <Label htmlFor="blog-thumbnail">Thumbnail URL (optional)</Label>
              <Input
                id="blog-thumbnail"
                placeholder="https://example.com/image.jpg"
                value={form.thumbnailUrl}
                onChange={(e) => {
                  setThumbnailPreviewError(false);
                  setForm((f) => ({ ...f, thumbnailUrl: e.target.value }));
                }}
              />
              {form.thumbnailUrl && !thumbnailPreviewError && (
                <div className="relative mt-1 h-24 w-40 overflow-hidden rounded-lg">
                  <Image
                    key={form.thumbnailUrl}
                    src={form.thumbnailUrl}
                    alt="Thumbnail preview"
                    fill
                    unoptimized
                    sizes="160px"
                    className="object-cover"
                    onError={() => setThumbnailPreviewError(true)}
                  />
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a tag"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                />
                <Button type="button" variant="secondary" size="sm" onClick={addTag}>
                  Add
                </Button>
              </div>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {form.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="hover:text-red-500 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Content editor */}
            <div className="space-y-1.5">
              <Label>Content</Label>
              <MinimalTiptapEditor
                key={editingArticle?.id ?? 'new'}
                value={form.content}
                onChange={(html) => setForm((f) => ({ ...f, content: html }))}
              />
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
              <div className="flex gap-2">
                <Button onClick={handleSave} loading={saving}>
                  {editingArticle ? 'Save Changes' : 'Create Article'}
                </Button>
                <Button variant="secondary" onClick={goBack}>
                  Cancel
                </Button>
              </div>

              {/* Translate button – only shown when editing an existing article */}
              {editingArticle && (
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowTranslateDropdown((v) => !v)}
                    className="gap-2"
                  >
                    <Languages className="h-4 w-4" />
                    Translate to…
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </Button>
                  {showTranslateDropdown && (
                    <div className="absolute right-0 bottom-10 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-3 min-w-52">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                        Select target language
                      </p>
                      <div className="space-y-1">
                        {availableTranslateTargets.map((locale) => (
                          <button
                            key={locale.code}
                            type="button"
                            onClick={() => setTranslateTarget(locale.code)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                              translateTarget === locale.code
                                ? 'bg-yellow-50 dark:bg-yellow-900/20 font-medium text-gray-900 dark:text-gray-100'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {locale.flag} {locale.label}
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                        <Button
                          size="sm"
                          className="w-full"
                          disabled={!translateTarget}
                          loading={translating}
                          onClick={handleTranslate}
                        >
                          Translate
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // LIST VIEW
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-[#efd957]" />
            Blog Articles
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Manage your blog articles
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Article
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-panel rounded-xl p-4 animate-pulse">
              <div className="h-4 w-1/3 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
              <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          ))}
        </div>
      ) : articles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">No articles yet</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 mb-4">
              Create your first blog article to get started
            </p>
            <Button onClick={openCreate} size="sm">
              <Plus className="h-4 w-4" />
              Create Article
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {articles.map((article) => (
            <div key={article.id} className="glass-panel rounded-xl p-4 flex flex-col gap-2">
              {/* Title */}
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                {article.title}
              </h3>
              {/* Badges row: visibility + language */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={article.published ? 'success' : 'secondary'}>
                  {article.published ? (
                    <>
                      <Eye className="h-3 w-3 mr-1" />
                      Published
                    </>
                  ) : (
                    <>
                      <EyeOff className="h-3 w-3 mr-1" />
                      Draft
                    </>
                  )}
                </Badge>
                {article.language && (
                  <Badge variant="info" className="text-xs">
                    {SUPPORTED_LOCALES.find((l) => l.code === article.language)?.flag ?? ''}{' '}
                    {getLanguageLabel(article.language)}
                  </Badge>
                )}
              </div>
              {/* Tags row */}
              {article.tags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {article.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
              {/* Bottom row: date left, actions right */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {formatDate(article.updatedAt)}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(article)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleTogglePublish(article)}
                    title={article.published ? 'Unpublish' : 'Publish'}
                  >
                    {article.published ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(article)}
                    loading={deleting === article.id}
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
