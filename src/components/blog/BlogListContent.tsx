'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PostinoLogo } from '@/components/brand/PostinoLogo';
import { useI18n } from '@/lib/i18n';
import { formatDate } from '@/lib/utils';
import type { BlogArticle } from '@/types';
import { ArrowRight, BookOpen, LayoutDashboard } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { signOut } from '@/lib/auth';

interface BlogListContentProps {
  articles: BlogArticle[];
}

export function BlogListContent({ articles }: BlogListContentProps) {
  const { t, locale } = useI18n();
  const { blog } = t.home;
  const { authUser, loading } = useAuth();

  // Show articles matching the user's locale; fall back to 'en' if none exist
  const localeArticles = articles.filter((a) => a.language === locale);
  const displayed =
    localeArticles.length > 0
      ? localeArticles
      : articles.filter((a) => a.language === 'en' || !a.language);

  return (
    <div className="min-h-full">
      <nav className="glass-panel sticky top-0 z-10 border-b border-white/40 dark:border-white/10 border-0! dark:bg-transparent!">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <PostinoLogo className="h-7 w-7" />
            <span className="font-bold text-xl text-gray-900 dark:text-gray-100">Postino</span>
          </Link>
          <div className="flex items-center gap-3">
            {!loading && authUser ? (
              <>
                <Button variant="ghost" onClick={() => signOut()}>
                  {t.nav.signOut}
                </Button>
                <Link href="/dashboard">
                  <Button>
                    <LayoutDashboard className="h-4 w-4" />
                    {t.nav.dashboard}
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost">{t.nav.signIn}</Button>
                </Link>
                <Link href="/register">
                  <Button>{t.nav.getStarted}</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 ui-fade-up min-h-[calc(100svh-8rem)]">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-yellow-100 dark:bg-violet-400/20 mb-4">
            <BookOpen className="h-7 w-7 text-[#8f7a18] dark:text-violet-300" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-3">{blog.title}</h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-xl mx-auto">
            {blog.subtitle}
          </p>
        </div>

        {displayed.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 dark:text-gray-500">No articles published yet.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 ui-stagger">
            {displayed.map((article) => (
              <Link
                key={article.id}
                href={`/blog/${article.slug}`}
                className="group glass-panel rounded-2xl overflow-hidden hover:shadow-lg transition-shadow flex flex-col"
              >
                {article.thumbnailUrl && (
                  <div className="relative aspect-video overflow-hidden">
                    <Image
                      src={article.thumbnailUrl}
                      alt={article.title}
                      fill
                      unoptimized
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                )}
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {article.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-2 group-hover:text-[#8f7a18] dark:group-hover:text-[#f3df79] transition-colors line-clamp-2">
                    {article.title}
                  </h2>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-auto pt-3 flex items-center justify-between">
                    <span>{formatDate(article.updatedAt)}</span>
                    <span className="flex items-center gap-1 text-[#8f7a18] dark:text-[#f3df79] font-medium">
                      {blog.readMore}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
