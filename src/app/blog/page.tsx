import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { adminDb } from '@/lib/firebase-admin';
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
      const db = adminDb();
      const snap = await db
        .collection('blogArticles')
        .where('published', '==', true)
        .orderBy('createdAt', 'desc')
        .select('title', 'slug', 'tags', 'thumbnailUrl', 'language', 'createdAt', 'updatedAt')
        .get();
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title,
          slug: data.slug,
          content: '',
          tags: data.tags ?? [],
          thumbnailUrl: data.thumbnailUrl ?? '',
          published: true,
          language: data.language ?? 'en',
          createdAt: data.createdAt?.toDate?.() ?? new Date(),
          updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
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
