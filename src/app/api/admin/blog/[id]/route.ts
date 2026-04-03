import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAdminRequest } from '@/lib/api-auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyAdminRequest(request);
    const { id } = await params;
    const db = adminDb();
    const snap = await db.collection('blogArticles').doc(id).get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const data = snap.data()!;
    return NextResponse.json({
      article: {
        id: snap.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    const status = msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500;
    if (status === 500) console.error('[admin/blog/[id]] GET error:', error);
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyAdminRequest(request);
    const { id } = await params;
    const db = adminDb();
    const body = await request.json();
    const { title, content, tags, thumbnailUrl, published, language, translationGroupId } = body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const snap = await db.collection('blogArticles').doc(id).get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await db.collection('blogArticles').doc(id).update({
      title: title.trim(),
      content,
      tags: Array.isArray(tags) ? tags.filter((t: unknown) => typeof t === 'string') : [],
      thumbnailUrl: typeof thumbnailUrl === 'string' ? thumbnailUrl.trim() : '',
      published: Boolean(published),
      language: typeof language === 'string' && language.trim() ? language.trim() : 'en',
      ...(typeof translationGroupId === 'string' && translationGroupId.trim()
        ? { translationGroupId: translationGroupId.trim() }
        : {}),
      updatedAt: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    const status = msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500;
    if (status === 500) console.error('[admin/blog/[id]] PUT error:', error);
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await verifyAdminRequest(request);
    const { id } = await params;
    const db = adminDb();
    const snap = await db.collection('blogArticles').doc(id).get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    await db.collection('blogArticles').doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    const status = msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500;
    if (status === 500) console.error('[admin/blog/[id]] DELETE error:', error);
    return NextResponse.json({ error: msg }, { status });
  }
}
