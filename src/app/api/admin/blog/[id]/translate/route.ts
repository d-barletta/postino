import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdminRequest, handleAdminError } from '@/lib/api-auth';
import { buildOpenRouterChatCompletionTrackingFields, getOpenRouterClient } from '@/lib/openrouter';
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
    const adminUser = await verifyAdminRequest(request);
    const { id } = await params;
    const supabase = createAdminClient();
    const body = await request.json();
    const { targetLanguage } = body;

    const validLocales = VALID_LOCALES as readonly string[];
    if (!targetLanguage || !validLocales.includes(targetLanguage)) {
      return NextResponse.json({ error: 'Invalid target language' }, { status: 400 });
    }

    // Fetch the source article
    const { data: sourceRow } = await supabase
      .from('blog_articles')
      .select('*')
      .eq('id', id)
      .single();
    if (!sourceRow) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    const sourceLanguage: string = sourceRow.language || 'en';
    const sourceTitle: string = sourceRow.title || '';
    const sourceThumbnailUrl: string = sourceRow.thumbnail_url || '';
    const sourceTags: string[] = Array.isArray(sourceRow.tags) ? sourceRow.tags : [];
    const sourceHtmlContent: string = sourceRow.content || '';

    if (sourceLanguage === targetLanguage) {
      return NextResponse.json(
        { error: 'Source and target languages are the same' },
        { status: 400 },
      );
    }

    // Determine the translationGroupId – reuse existing or create new from source id
    const groupId: string = (sourceRow.translation_group_id as string) || id;

    // Check if a translation in the target language already exists in this group
    const { data: existingTranslations } = await supabase
      .from('blog_articles')
      .select('id')
      .eq('translation_group_id', groupId)
      .eq('language', targetLanguage)
      .limit(1);
    if (existingTranslations && existingTranslations.length > 0) {
      return NextResponse.json(
        {
          error: 'A translation in this language already exists',
          existingId: existingTranslations[0].id,
        },
        { status: 409 },
      );
    }

    // Make sure the source article also has the groupId set
    if (!sourceRow.translation_group_id) {
      await supabase.from('blog_articles').update({ translation_group_id: groupId }).eq('id', id);
    }

    // Call LLM for translation
    const { client, model } = await getOpenRouterClient({
      userId: adminUser.email,
      sessionId: `admin-blog-translate:${id}:${targetLanguage}`,
    });
    const targetLangName = LOCALE_NAMES[targetLanguage] ?? targetLanguage;
    const sourceLangName = LOCALE_NAMES[sourceLanguage] ?? sourceLanguage;

    const systemPrompt = `You are a professional translator and content writer. You translate blog articles accurately and naturally, preserving HTML structure and formatting. Translate from ${sourceLangName} to ${targetLangName}. Return ONLY a JSON object with three fields: "title" (translated title string), "content" (translated HTML content string), and "tags" (array of translated tag strings). Do not add explanations or markdown code blocks.`;

    const userPrompt = `Translate this blog article from ${sourceLangName} to ${targetLangName}.

TITLE: ${sourceTitle}

TAGS: ${JSON.stringify(sourceTags)}

CONTENT (HTML):
${sourceHtmlContent}`;

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      ...buildOpenRouterChatCompletionTrackingFields({
        userId: adminUser.email,
        sessionId: `admin-blog-translate:${id}:${targetLanguage}`,
      }),
      response_format: { type: 'json_object' },
      max_tokens: 100000,
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    const cleaned = raw.trim();

    let parsed: { title?: string; content?: string; tags?: unknown };
    try {
      parsed = JSON.parse(jsonrepair(cleaned));
    } catch {
      console.error('[admin/blog/translate] LLM response could not be parsed:', raw);
      return NextResponse.json({ error: 'LLM returned invalid JSON' }, { status: 500 });
    }

    const translatedTitle = typeof parsed.title === 'string' ? parsed.title.trim() : sourceTitle;
    const translatedContent =
      typeof parsed.content === 'string' ? parsed.content : sourceHtmlContent;
    const translatedTags: string[] =
      Array.isArray(parsed.tags) && parsed.tags.every((t) => typeof t === 'string')
        ? (parsed.tags as string[])
        : sourceTags;

    // Generate slug for translated article
    const baseSlug = slugify(translatedTitle);
    let slug = `${baseSlug}-${targetLanguage}`;
    let counter = 1;
    while (counter <= 100) {
      const { data: existing } = await supabase
        .from('blog_articles')
        .select('id')
        .eq('slug', slug)
        .limit(1);
      if (!existing || existing.length === 0) break;
      slug = `${baseSlug}-${targetLanguage}-${counter++}`;
    }

    const now = new Date().toISOString();
    const { data: newRow } = await supabase
      .from('blog_articles')
      .insert({
        slug,
        title: translatedTitle,
        thumbnail_url: sourceThumbnailUrl,
        published: false, // translated articles start as drafts
        language: targetLanguage,
        translation_group_id: groupId,
        created_at: now,
        updated_at: now,
        content: translatedContent,
        tags: translatedTags,
      })
      .select('id, slug')
      .single();

    revalidateTag('blog-articles', {});
    return NextResponse.json(
      { id: newRow?.id, slug: newRow?.slug ?? slug, title: translatedTitle },
      { status: 201 },
    );
  } catch (error) {
    return handleAdminError(error, 'admin/blog/[id]/translate POST');
  }
}
