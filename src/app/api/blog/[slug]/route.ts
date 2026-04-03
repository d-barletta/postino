import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const db = adminDb();
    const snap = await db
      .collection('blogArticles')
      .where('slug', '==', slug)
      .where('published', '==', true)
      .limit(1)
      .get();
    if (snap.empty) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const d = snap.docs[0];
    const data = d.data();
    return NextResponse.json({
      article: {
        id: d.id,
        title: data.title,
        slug: data.slug,
        content: data.content,
        tags: data.tags ?? [],
        thumbnailUrl: data.thumbnailUrl ?? '',
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error('[blog/[slug]] GET error:', error);
    return NextResponse.json({ error: 'Failed to load article' }, { status: 500 });
  }
}
