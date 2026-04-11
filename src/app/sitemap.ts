import type { MetadataRoute } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

async function getBlogSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('blog_articles')
      .select('slug, updated_at')
      .eq('published', true)
      .order('updated_at', { ascending: false });
    return (data ?? []).map((row) => ({
      url: `${appUrl.replace(/\/$/, '')}/blog/${row.slug}`,
      lastModified: row.updated_at ? new Date(row.updated_at) : new Date(),
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
