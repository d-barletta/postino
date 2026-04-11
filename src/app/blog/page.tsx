import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { BlogListContent } from '@/components/blog/BlogListContent';
import type { BlogArticle } from '@/types';

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Tips, updates and insights from the Postino team about AI-powered email management.',
  openGraph: {
    type: 'website',
    title: 'Blog | Postino',
    description:
      'Tips, updates and insights from the Postino team about AI-powered email management.',
    url: `${appUrl}/blog`,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Blog | Postino',
    description:
      'Tips, updates and insights from the Postino team about AI-powered email management.',
  },
  alternates: {
    canonical: `${appUrl}/blog`,
    languages: {
      en: `${appUrl}/blog`,
      it: `${appUrl}/blog`,
      es: `${appUrl}/blog`,
      fr: `${appUrl}/blog`,
      de: `${appUrl}/blog`,
    },
  },
};

const getPublishedArticles = unstable_cache(
  async (): Promise<BlogArticle[]> => {
    try {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from('blog_articles')
        .select('id, title, slug, tags, thumbnail_url, language, created_at, updated_at')
        .eq('published', true)
        .order('created_at', { ascending: false });
      return (data ?? []).map((row) => {
        return {
          id: row.id,
          title: row.title,
          slug: row.slug,
          content: '',
          tags: row.tags ?? [],
          thumbnailUrl: row.thumbnail_url ?? '',
          published: true,
          language: row.language ?? 'en',
          createdAt: row.created_at ? new Date(row.created_at) : new Date(),
          updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
        };
      });
    } catch {
      return [];
    }
  },
  ['blog-articles'],
  { tags: ['blog-articles'] },
);

export default async function BlogPage() {
  const articles = await getPublishedArticles();
  return <BlogListContent articles={articles} />;
}
