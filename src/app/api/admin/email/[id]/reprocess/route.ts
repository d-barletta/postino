import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { processEmailWithAgent } from '@/lib/agent';
import type { RuleForProcessing } from '@/lib/openrouter';

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.split('Bearer ')[1];
  const decoded = await adminAuth().verifyIdToken(token);
  const db = adminDb();
  const userSnap = await db.collection('users').doc(decoded.uid).get();
  if (!userSnap.data()?.isAdmin) throw new Error('Forbidden');
  return decoded;
}

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
    await verifyAdmin(request);

    const { id } = await params;
    const db = adminDb();
    const logSnap = await db.collection('emailLogs').doc(id).get();

    if (!logSnap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const data = logSnap.data()!;
    const userId = data.userId as string;
    const emailFrom = (data.fromAddress as string) || '';
    const emailSubject = (data.subject as string) || '';
    const originalBody = (data.originalBody as string) || '';

    // Fetch active rules for this email's owner
    const rulesSnap = await db
      .collection('rules')
      .where('userId', '==', userId)
      .where('isActive', '==', true)
      .get();

    const allRules = rulesSnap.docs.map((d) => ({
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
      isHtml
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
    return NextResponse.json({ error: msg }, { status });
  }
}
