import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { BlogArticleContent } from '@/components/blog/BlogArticleContent';
import type { BlogArticle } from '@/types';

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

const getArticle = unstable_cache(
  async (slug: string): Promise<BlogArticle | null> => {
    try {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from('blog_articles')
        .select(
          'id, title, slug, content, tags, thumbnail_url, language, translation_group_id, created_at, updated_at',
        )
        .eq('slug', slug)
        .eq('published', true)
        .limit(1)
        .single();
      if (!data) return null;
      return {
        id: data.id,
        title: data.title,
        slug: data.slug,
        content: data.content,
        tags: data.tags ?? [],
        thumbnailUrl: data.thumbnail_url ?? '',
        published: true,
        language: data.language ?? 'en',
        translationGroupId: data.translation_group_id ?? undefined,
        createdAt: data.created_at ? new Date(data.created_at) : new Date(),
        updatedAt: data.updated_at ? new Date(data.updated_at) : new Date(),
      };
    } catch {
      return null;
    }
  },
  ['blog-article'],
  { tags: ['blog-articles'] },
);

const getArticleSiblings = unstable_cache(
  async (groupId: string): Promise<Record<string, string>> => {
    try {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from('blog_articles')
        .select('slug, language')
        .eq('translation_group_id', groupId)
        .eq('published', true);
      const result: Record<string, string> = {};
      for (const row of data ?? []) {
        if (row.language && row.slug) result[row.language] = row.slug;
      }
      return result;
    } catch {
      return {};
    }
  },
  ['blog-article-siblings'],
  { tags: ['blog-articles'] },
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) return { title: 'Article Not Found' };

  const description = article.content
    .replace(/<[^>]+>/g, '')
    .slice(0, 160)
    .trim();

  const canonicalUrl = `${appUrl}/blog/${article.slug}`;

  return {
    title: article.title,
    description,
    keywords: article.tags,
    openGraph: {
      type: 'article',
      title: article.title,
      description,
      url: canonicalUrl,
      siteName: 'Postino',
      publishedTime: new Date(article.createdAt).toISOString(),
      modifiedTime: new Date(article.updatedAt).toISOString(),
      tags: article.tags,
      ...(article.thumbnailUrl
        ? { images: [{ url: article.thumbnailUrl, alt: article.title }] }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description,
      ...(article.thumbnailUrl ? { images: [article.thumbnailUrl] } : {}),
    },
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: canonicalUrl,
        it: canonicalUrl,
        es: canonicalUrl,
        fr: canonicalUrl,
        de: canonicalUrl,
      },
    },
  };
}

export default async function BlogArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) notFound();
  const translations = article.translationGroupId
    ? await getArticleSiblings(article.translationGroupId)
    : {};
  return <BlogArticleContent article={article} translations={translations} />;
}
