import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdminRequest, handleAdminError } from '@/lib/api-auth';

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function GET(request: NextRequest) {
  try {
    await verifyAdminRequest(request);
    const supabase = createAdminClient();
    const { data: rows } = await supabase
      .from('blog_articles')
      .select('*')
      .order('created_at', { ascending: false });

    const articles = (rows ?? []).map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      thumbnailUrl: row.thumbnail_url,
      published: row.published,
      language: row.language,
      translationGroupId: row.translation_group_id ?? null,
      createdAt: row.created_at ?? null,
      updatedAt: row.updated_at ?? null,
      content: row.content,
      tags: row.tags ?? [],
    }));

    return NextResponse.json({ articles });
  } catch (error) {
    return handleAdminError(error, 'admin/blog GET');
  }
}

export async function POST(request: NextRequest) {
  try {
    await verifyAdminRequest(request);
    const supabase = createAdminClient();
    const body = await request.json();
    const { title, content, tags, thumbnailUrl, published, language, translationGroupId } = body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const baseSlug = slugify(title);
    let slug = baseSlug;
    let counter = 1;
    const MAX_SLUG_ITERATIONS = 100;
    while (counter <= MAX_SLUG_ITERATIONS) {
      const { data: existing } = await supabase
        .from('blog_articles')
        .select('id')
        .eq('slug', slug)
        .limit(1);
      if (!existing || existing.length === 0) break;
      slug = `${baseSlug}-${counter++}`;
    }
    if (counter > MAX_SLUG_ITERATIONS) {
      return NextResponse.json({ error: 'Could not generate a unique slug' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const { data: inserted } = await supabase
      .from('blog_articles')
      .insert({
        slug,
        title: title.trim(),
        thumbnail_url: typeof thumbnailUrl === 'string' ? thumbnailUrl.trim() : '',
        published: Boolean(published),
        language: typeof language === 'string' && language.trim() ? language.trim() : 'en',
        translation_group_id:
          typeof translationGroupId === 'string' && translationGroupId.trim()
            ? translationGroupId.trim()
            : null,
        created_at: now,
        updated_at: now,
        content,
        tags: Array.isArray(tags) ? tags.filter((t: unknown) => typeof t === 'string') : [],
      })
      .select('id, slug')
      .single();

    revalidateTag('blog-articles', {});
    return NextResponse.json({ id: inserted?.id, slug: inserted?.slug ?? slug }, { status: 201 });
  } catch (error) {
    return handleAdminError(error, 'admin/blog POST');
  }
}
