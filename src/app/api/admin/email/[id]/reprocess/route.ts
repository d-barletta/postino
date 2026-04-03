import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { processEmailWithAgent } from '@/lib/agent';
import type { RuleForProcessing } from '@/lib/openrouter';
import { verifyAdminRequest } from '@/lib/api-auth';

/** Returns true if the value contains the pattern (case-insensitive), or if pattern is empty. */
function matchesPattern(value: string, pattern?: string): boolean {
  if (!pattern || !pattern.trim()) return true;
  return value.toLowerCase().includes(pattern.toLowerCase());
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyAdminRequest(request);

    const { id } = await params;
    const db = adminDb();
    const logSnap = await db.collection('emailLogs').doc(id).get();

    if (!logSnap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Parse optional model override from request body
    let modelOverride: string | undefined;
    try {
      const body = await request.json();
      if (typeof body?.model === 'string' && body.model.trim()) {
        modelOverride = body.model.trim();
      }
    } catch {
      // No body or invalid JSON — proceed without model override
    }

    const data = logSnap.data()!;
    const userId = data.userId as string;
    const emailFrom = (data.fromAddress as string) || '';
    const emailSubject = (data.subject as string) || '';
    const originalBody = (data.originalBody as string) || '';

    // Fetch the email owner's analysis language preference
    const userSnap = await db.collection('users').doc(userId).get();
    const analysisOutputLanguage = typeof userSnap.data()?.analysisOutputLanguage === 'string'
      ? (userSnap.data()!.analysisOutputLanguage as string) || undefined
      : undefined;

    // Fetch active rules for this email's owner
    const rulesSnap = await db
      .collection('rules')
      .where('userId', '==', userId)
      .where('isActive', '==', true)
      .get();

    // Sort rules by sortOrder ASC (user-defined), then by createdAt ASC as tiebreaker,
    // so rules are always applied in a deterministic order that matches what the user sees.
    const allRules = rulesSnap.docs
      .sort((a, b) => {
        const aOrder = typeof a.data().sortOrder === 'number' ? a.data().sortOrder as number : Number.MAX_SAFE_INTEGER;
        const bOrder = typeof b.data().sortOrder === 'number' ? b.data().sortOrder as number : Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return (a.data().createdAt?.toMillis?.() ?? 0) - (b.data().createdAt?.toMillis?.() ?? 0);
      })
      .map((d) => ({
        id: d.id,
        name: (d.data().name as string) || d.id,
        text: d.data().text as string,
        matchSender: (d.data().matchSender as string) || '',
        matchSubject: (d.data().matchSubject as string) || '',
        matchBody: (d.data().matchBody as string) || '',
      }));

    // Filter rules by pattern matching (same logic as the inbound route)
    const matchingRules: RuleForProcessing[] = allRules.filter(
      (r) =>
        matchesPattern(emailFrom, r.matchSender) &&
        matchesPattern(emailSubject, r.matchSubject) &&
        matchesPattern(originalBody, r.matchBody)
    );

    // Detect whether the original body is HTML
    const isHtml = /<[a-z][\s\S]*>/i.test(originalBody);

    const result = await processEmailWithAgent(
      userId,
      id,
      emailFrom,
      emailSubject,
      originalBody,
      matchingRules,
      isHtml,
      modelOverride,
      undefined, // attachmentNames — not stored on reprocessed logs
      analysisOutputLanguage,
    );

    return NextResponse.json({
      subject: result.subject,
      body: result.body,
      tokensUsed: result.tokensUsed,
      estimatedCost: result.estimatedCost,
      ruleApplied: result.ruleApplied,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    const status = msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500;
    if (status === 500) console.error('[admin/email/[id]/reprocess] error:', error);
    return NextResponse.json({ error: msg }, { status });
  }
}
