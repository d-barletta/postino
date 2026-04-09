import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAdminRequest, handleAdminError } from '@/lib/api-auth';
import { getOpenRouterClient } from '@/lib/openrouter';
import { jsonrepair } from 'jsonrepair';

const VALID_LOCALES = ['en', 'it', 'es', 'fr', 'de'] as const;

const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  it: 'Italian',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
};

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyAdminRequest(request);
    const { id } = await params;
    const db = adminDb();
    const body = await request.json();
    const { targetLanguage } = body;

    const validLocales = VALID_LOCALES as readonly string[];
    if (!targetLanguage || !validLocales.includes(targetLanguage)) {
      return NextResponse.json({ error: 'Invalid target language' }, { status: 400 });
    }

    // Fetch the source article
    const snap = await db.collection('blogArticles').doc(id).get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }
    const sourceData = snap.data()!;
    const sourceLanguage: string = sourceData.language || 'en';

    if (sourceLanguage === targetLanguage) {
      return NextResponse.json(
        { error: 'Source and target languages are the same' },
        { status: 400 },
      );
    }

    // Determine the translationGroupId – reuse existing or create new from source id
    const groupId: string = sourceData.translationGroupId || id;

    // Check if a translation in the target language already exists in this group
    const existingSnap = await db
      .collection('blogArticles')
      .where('translationGroupId', '==', groupId)
      .where('language', '==', targetLanguage)
      .limit(1)
      .get();
    if (!existingSnap.empty) {
      return NextResponse.json(
        {
          error: 'A translation in this language already exists',
          existingId: existingSnap.docs[0].id,
        },
        { status: 409 },
      );
    }

    // Make sure the source article also has the groupId set
    if (!sourceData.translationGroupId) {
      await db.collection('blogArticles').doc(id).update({ translationGroupId: groupId });
    }

    // Call LLM for translation
    const { client, model } = await getOpenRouterClient();
    const targetLangName = LOCALE_NAMES[targetLanguage] ?? targetLanguage;
    const sourceLangName = LOCALE_NAMES[sourceLanguage] ?? sourceLanguage;

    const systemPrompt = `You are a professional translator and content writer. You translate blog articles accurately and naturally, preserving HTML structure and formatting. Translate from ${sourceLangName} to ${targetLangName}. Return ONLY a JSON object with three fields: "title" (translated title string), "content" (translated HTML content string), and "tags" (array of translated tag strings). Do not add explanations or markdown code blocks.`;

    const sourceTags: string[] = sourceData.tags ?? [];
    const userPrompt = `Translate this blog article from ${sourceLangName} to ${targetLangName}.

TITLE: ${sourceData.title}

TAGS: ${JSON.stringify(sourceTags)}

CONTENT (HTML):
${sourceData.content}`;

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 100000,
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    // Strip markdown code fences that some models add despite response_format.
    // Trim first so that a leading/trailing newline around the fence doesn't
    // prevent the anchored regexes from matching.
    const cleaned = raw.trim();

    let parsed: { title?: string; content?: string; tags?: unknown };
    try {
      parsed = JSON.parse(jsonrepair(cleaned));
    } catch {
      console.error('[admin/blog/translate] LLM response could not be parsed:', raw);
      return NextResponse.json({ error: 'LLM returned invalid JSON' }, { status: 500 });
    }

    const translatedTitle =
      typeof parsed.title === 'string' ? parsed.title.trim() : sourceData.title;
    const translatedContent =
      typeof parsed.content === 'string' ? parsed.content : sourceData.content;
    const translatedTags: string[] =
      Array.isArray(parsed.tags) && parsed.tags.every((t) => typeof t === 'string')
        ? (parsed.tags as string[])
        : (sourceData.tags ?? []);

    // Generate slug for translated article
    const baseSlug = slugify(translatedTitle);
    let slug = `${baseSlug}-${targetLanguage}`;
    let counter = 1;
    while (counter <= 100) {
      const existing = await db.collection('blogArticles').where('slug', '==', slug).limit(1).get();
      if (existing.empty) break;
      slug = `${baseSlug}-${targetLanguage}-${counter++}`;
    }

    const now = new Date();
    const newDoc = await db.collection('blogArticles').add({
      title: translatedTitle,
      slug,
      content: translatedContent,
      tags: translatedTags,
      thumbnailUrl: sourceData.thumbnailUrl ?? '',
      published: false, // translated articles start as drafts
      language: targetLanguage,
      translationGroupId: groupId,
      createdAt: now,
      updatedAt: now,
    });

    revalidateTag('blog-articles', {});
    return NextResponse.json({ id: newDoc.id, slug, title: translatedTitle }, { status: 201 });
  } catch (error) {
    return handleAdminError(error, 'admin/blog/[id]/translate POST');
  }
}
