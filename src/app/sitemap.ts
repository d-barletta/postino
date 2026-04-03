import type { MetadataRoute } from 'next';
import { adminDb } from '@/lib/firebase-admin';

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

async function getBlogSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const db = adminDb();
    const snap = await db
      .collection('blogArticles')
      .where('published', '==', true)
      .orderBy('updatedAt', 'desc')
      .get();
    return snap.docs.map((d) => ({
      url: `${appUrl.replace(/\/$/, '')}/blog/${d.data().slug}`,
      lastModified: d.data().updatedAt?.toDate?.() ?? new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl.replace(/\/$/, '');
  const blogEntries = await getBlogSitemapEntries();

  return [
    {
      url: `${base}/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${base}/blog`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${base}/login`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${base}/register`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    ...blogEntries,
  ];
}
