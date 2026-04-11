import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data: rows, error } = await supabase
      .from('blog_articles')
      .select('id, slug, title, thumbnail_url, language, created_at, updated_at, tags')
      .eq('published', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const articles = (rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      tags: row.tags ?? [],
      thumbnailUrl: row.thumbnail_url ?? '',
      language: row.language ?? 'en',
      createdAt: row.created_at ?? null,
      updatedAt: row.updated_at ?? null,
    }));
    return NextResponse.json({ articles });
  } catch (error) {
    console.error('[blog] GET error:', error);
    return NextResponse.json({ error: 'Failed to load articles' }, { status: 500 });
  }
}
