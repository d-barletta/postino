import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { adminDb } from '@/lib/firebase-admin';
import { BlogArticleContent } from '@/components/blog/BlogArticleContent';
import type { BlogArticle } from '@/types';

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

async function getArticle(slug: string): Promise<BlogArticle | null> {
  try {
    const db = adminDb();
    const snap = await db
      .collection('blogArticles')
      .where('slug', '==', slug)
      .where('published', '==', true)
      .limit(1)
      .get();
    if (snap.empty) return null;
    const d = snap.docs[0];
    const data = d.data();
    return {
      id: d.id,
      title: data.title,
      slug: data.slug,
      content: data.content,
      tags: data.tags ?? [],
      thumbnailUrl: data.thumbnailUrl ?? '',
      published: true,
      language: data.language ?? 'en',
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
    };
  } catch {
    return null;
  }
}

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
      publishedTime: article.createdAt.toISOString(),
      modifiedTime: article.updatedAt.toISOString(),
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

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) notFound();
  return <BlogArticleContent article={article} />;
}
