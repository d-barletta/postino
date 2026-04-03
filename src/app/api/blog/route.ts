import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function GET() {
  try {
    const db = adminDb();
    const snap = await db
      .collection('blogArticles')
      .orderBy('createdAt', 'desc')
      .get();
    const articles = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title,
          slug: data.slug,
          tags: data.tags ?? [],
          thumbnailUrl: data.thumbnailUrl ?? '',
          language: data.language ?? 'en',
          published: data.published === true,
          createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
        };
      })
      .filter((a) => a.published);
    return NextResponse.json({ articles });
  } catch (error) {
    console.error('[blog] GET error:', error);
    return NextResponse.json({ error: 'Failed to load articles' }, { status: 500 });
  }
}
