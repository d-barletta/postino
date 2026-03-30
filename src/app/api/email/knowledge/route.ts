import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

const FETCH_LIMIT = 1000;
const TOP_N = 50;

interface CountMap {
  [value: string]: number;
}

function toSortedArray(map: CountMap): { value: string; count: number }[] {
  return Object.entries(map)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N);
}

function increment(map: CountMap, value: unknown): void {
  if (typeof value === 'string' && value.trim()) {
    const key = value.trim();
    map[key] = (map[key] ?? 0) + 1;
  }
}

function incrementAll(map: CountMap, values: unknown): void {
  if (Array.isArray(values)) {
    for (const v of values) increment(map, v);
  }
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth().verifyIdToken(token);

    const db = adminDb();
    const snap = await db
      .collection('emailLogs')
      .where('userId', '==', decoded.uid)
      .orderBy('receivedAt', 'desc')
      .limit(FETCH_LIMIT)
      .get();

    const topics: CountMap = {};
    const tags: CountMap = {};
    const people: CountMap = {};
    const organizations: CountMap = {};
    const places: CountMap = {};
    const events: CountMap = {};

    let totalEmails = 0;

    for (const doc of snap.docs) {
      const analysis = doc.data().emailAnalysis as Record<string, unknown> | undefined;
      if (!analysis) continue;
      totalEmails++;
      incrementAll(topics, analysis.topics);
      incrementAll(tags, analysis.tags);
      const entities = analysis.entities as Record<string, unknown> | undefined;
      if (entities) {
        incrementAll(people, entities.people);
        incrementAll(organizations, entities.organizations);
        incrementAll(places, entities.places);
        incrementAll(events, entities.events);
      }
    }

    return NextResponse.json({
      topics: toSortedArray(topics),
      tags: toSortedArray(tags),
      people: toSortedArray(people),
      organizations: toSortedArray(organizations),
      places: toSortedArray(places),
      events: toSortedArray(events),
      totalEmails,
    });
  } catch (err) {
    const isAuthError =
      err instanceof Error &&
      (err.message.includes('auth') || err.message.includes('token') || err.message.includes('Firebase'));
    if (isAuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch knowledge data' }, { status: 500 });
  }
}
