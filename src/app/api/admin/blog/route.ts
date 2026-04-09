import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { adminDb } from '@/lib/firebase-admin';
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
    const db = adminDb();
    const snap = await db.collection('blogArticles').orderBy('createdAt', 'desc').get();
    const articles = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null,
      updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() ?? null,
    }));
    return NextResponse.json({ articles });
  } catch (error) {
    return handleAdminError(error, 'admin/blog GET');
  }
}

export async function POST(request: NextRequest) {
  try {
    await verifyAdminRequest(request);
    const db = adminDb();
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
      const existing = await db.collection('blogArticles').where('slug', '==', slug).limit(1).get();
      if (existing.empty) break;
      slug = `${baseSlug}-${counter++}`;
    }
    if (counter > MAX_SLUG_ITERATIONS) {
      return NextResponse.json({ error: 'Could not generate a unique slug' }, { status: 409 });
    }

    const now = new Date();
    const docRef = await db.collection('blogArticles').add({
      title: title.trim(),
      slug,
      content,
      tags: Array.isArray(tags) ? tags.filter((t: unknown) => typeof t === 'string') : [],
      thumbnailUrl: typeof thumbnailUrl === 'string' ? thumbnailUrl.trim() : '',
      published: Boolean(published),
      language: typeof language === 'string' && language.trim() ? language.trim() : 'en',
      ...(typeof translationGroupId === 'string' && translationGroupId.trim()
        ? { translationGroupId: translationGroupId.trim() }
        : {}),
      createdAt: now,
      updatedAt: now,
    });

    revalidateTag('blog-articles', {});
    return NextResponse.json({ id: docRef.id, slug }, { status: 201 });
  } catch (error) {
    return handleAdminError(error, 'admin/blog POST');
  }
}
