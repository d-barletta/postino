'use client';

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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog';
import { MinimalTiptapEditor } from '@/components/blog/MinimalTiptapEditor';
import { formatDate } from '@/lib/utils';
import type { BlogArticle } from '@/types';
import { Plus, Pencil, Trash2, Eye, EyeOff, BookOpen, X } from 'lucide-react';

interface ArticleFormState {
  title: string;
  content: string;
  tags: string[];
  thumbnailUrl: string;
  published: boolean;
}

const EMPTY_FORM: ArticleFormState = {
  title: '',
  content: '',
  tags: [],
  thumbnailUrl: '',
  published: false,
};

export default function AdminBlogTab() {
  const { firebaseUser } = useAuth();
  const [articles, setArticles] = useState<BlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingArticle, setEditingArticle] = useState<BlogArticle | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState<ArticleFormState>(EMPTY_FORM);
  const [tagInput, setTagInput] = useState('');

  const fetchArticles = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const token = await firebaseUser.getIdToken();
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
  }, [firebaseUser]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const openCreate = () => {
    setEditingArticle(null);
    setForm(EMPTY_FORM);
    setTagInput('');
    setIsDialogOpen(true);
  };

  const openEdit = (article: BlogArticle) => {
    setEditingArticle(article);
    setForm({
      title: article.title,
      content: article.content,
      tags: article.tags,
      thumbnailUrl: article.thumbnailUrl ?? '',
      published: article.published,
    });
    setTagInput('');
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingArticle(null);
    setForm(EMPTY_FORM);
    setTagInput('');
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
    if (!firebaseUser) return;
    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!form.content.trim() || form.content === '<p></p>') {
      toast.error('Content is required');
      return;
    }

    setSaving(true);
    try {
      const token = await firebaseUser.getIdToken();
      const url = editingArticle ? `/api/admin/blog/${editingArticle.id}` : '/api/admin/blog';
      const method = editingArticle ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        toast.success(editingArticle ? 'Article updated' : 'Article created');
        closeDialog();
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
    if (!firebaseUser) return;
    if (!confirm(`Delete article "${article.title}"?`)) return;

    setDeleting(article.id);
    try {
      const token = await firebaseUser.getIdToken();
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
    if (!firebaseUser) return;
    try {
      const token = await firebaseUser.getIdToken();
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
            <div
              key={article.id}
              className="glass-panel rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {article.title}
                  </h3>
                  <Badge variant={article.published ? 'success' : 'secondary'}>
                    {article.published ? (
                      <><Eye className="h-3 w-3 mr-1" />Published</>
                    ) : (
                      <><EyeOff className="h-3 w-3 mr-1" />Draft</>
                    )}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {article.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {formatDate(article.updatedAt)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
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
                <Button variant="ghost" size="sm" onClick={() => openEdit(article)}>
                  <Pencil className="h-4 w-4" />
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
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent
          className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>{editingArticle ? 'Edit Article' : 'New Article'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="blog-title">Title</Label>
              <Input
                id="blog-title"
                placeholder="Article title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="blog-thumbnail">Thumbnail URL (optional)</Label>
              <Input
                id="blog-thumbnail"
                placeholder="https://example.com/image.jpg"
                value={form.thumbnailUrl}
                onChange={(e) => setForm((f) => ({ ...f, thumbnailUrl: e.target.value }))}
              />
              {form.thumbnailUrl && (
                <img
                  src={form.thumbnailUrl}
                  alt="Thumbnail preview"
                  className="h-24 w-auto rounded-lg object-cover mt-1"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
            </div>

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

            <div className="flex items-center gap-3">
              <Switch
                id="blog-published"
                checked={form.published}
                onCheckedChange={(v) => setForm((f) => ({ ...f, published: v }))}
              />
              <Label htmlFor="blog-published">Published</Label>
            </div>

            <div className="space-y-1.5">
              <Label>Content</Label>
              <MinimalTiptapEditor
                key={editingArticle?.id ?? 'new'}
                value={form.content}
                onChange={(html) => setForm((f) => ({ ...f, content: html }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {editingArticle ? 'Save Changes' : 'Create Article'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
