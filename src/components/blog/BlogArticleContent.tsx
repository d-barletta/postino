'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PostinoLogo } from '@/components/brand/PostinoLogo';
import { useI18n } from '@/lib/i18n';
import { formatDate } from '@/lib/utils';
import { BlogContentRenderer } from '@/components/blog/MinimalTiptapEditor';
import type { BlogArticle } from '@/types';
import { ArrowLeft, Calendar } from 'lucide-react';

interface BlogArticleContentProps {
  article: BlogArticle;
}

export function BlogArticleContent({ article }: BlogArticleContentProps) {
  const { t } = useI18n();
  const { blog } = t.home;

  return (
    <div className="min-h-full">
      <nav className="glass-panel sticky top-0 z-10 border-b border-white/40 dark:border-white/10 border-0! dark:bg-transparent!">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <PostinoLogo className="h-7 w-7" />
            <span className="font-bold text-xl text-gray-900 dark:text-gray-100">Postino</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost">{t.nav.signIn}</Button>
            </Link>
            <Link href="/register">
              <Button>{t.nav.getStarted}</Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 ui-fade-up">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          {blog.backToBlog}
        </Link>

        <article>
          <header className="mb-8">
            {article.thumbnailUrl && (
              <img
                src={article.thumbnailUrl}
                alt={article.title}
                className="w-full aspect-video object-cover rounded-2xl shadow-md mb-7"
              />
            )}

            <div className="flex flex-wrap gap-2 mb-4">
              {article.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4 leading-tight">
              {article.title}
            </h1>

            <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
              <Calendar className="h-4 w-4" />
              <time dateTime={article.updatedAt.toISOString()}>
                {formatDate(article.updatedAt)}
              </time>
            </div>
          </header>

          <BlogContentRenderer content={article.content} />
        </article>
      </main>
    </div>
  );
}
