import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const supabase = createAdminClient();
    const { data: row, error } = await supabase
      .from('blog_articles')
      .select('id, slug, title, thumbnail_url, language, created_at, updated_at, content, tags')
      .eq('slug', slug)
      .eq('published', true)
      .limit(1)
      .single();

    if (error || !row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({
      article: {
        id: row.id,
        title: row.title,
        slug: row.slug,
        content: row.content ?? '',
        tags: row.tags ?? [],
        thumbnailUrl: row.thumbnail_url ?? '',
        language: row.language ?? 'en',
        createdAt: row.created_at ?? null,
        updatedAt: row.updated_at ?? null,
      },
    });
  } catch (error) {
    console.error('[blog/[slug]] GET error:', error);
    return NextResponse.json({ error: 'Failed to load article' }, { status: 500 });
  }
}
