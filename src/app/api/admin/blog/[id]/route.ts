import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdminRequest, handleAdminError } from '@/lib/api-auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyAdminRequest(request);
    const { id } = await params;
    const supabase = createAdminClient();
    const { data: row } = await supabase.from('blog_articles').select('*').eq('id', id).single();
    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({
      article: {
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
      },
    });
  } catch (error) {
    return handleAdminError(error, 'admin/blog/[id] GET');
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyAdminRequest(request);
    const { id } = await params;
    const supabase = createAdminClient();
    const body = await request.json();
    const { title, content, tags, thumbnailUrl, published, language, translationGroupId } = body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('blog_articles')
      .select('id')
      .eq('id', id)
      .single();
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await supabase
      .from('blog_articles')
      .update({
        title: title.trim(),
        thumbnail_url: typeof thumbnailUrl === 'string' ? thumbnailUrl.trim() : '',
        published: Boolean(published),
        language: typeof language === 'string' && language.trim() ? language.trim() : 'en',
        translation_group_id:
          typeof translationGroupId === 'string' && translationGroupId.trim()
            ? translationGroupId.trim()
            : null,
        updated_at: new Date().toISOString(),
        content,
        tags: Array.isArray(tags) ? tags.filter((t: unknown) => typeof t === 'string') : [],
      })
      .eq('id', id);

    revalidateTag('blog-articles', {});
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAdminError(error, 'admin/blog/[id] PUT');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await verifyAdminRequest(request);
    const { id } = await params;
    const supabase = createAdminClient();
    const { data: existing } = await supabase
      .from('blog_articles')
      .select('id')
      .eq('id', id)
      .single();
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    await supabase.from('blog_articles').delete().eq('id', id);
    revalidateTag('blog-articles', {});
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAdminError(error, 'admin/blog/[id] DELETE');
  }
}
