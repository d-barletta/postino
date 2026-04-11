import { NextRequest, NextResponse } from 'next/server';
import Supermemory from 'supermemory';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';

function resolveMemoryApiKey(settingsApiKey?: string): string {
  return (settingsApiKey || process.env.SUPERMEMORY_API_KEY || '').trim();
}

export async function DELETE(request: NextRequest) {
  try {
    const { id: uid } = await verifyUserRequest(request);
    const supabase = createAdminClient();
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('data')
      .eq('id', 'global')
      .single();
    const settingsData = (settingsRow?.data as Record<string, unknown>) ?? {};
    const memoryApiKey = resolveMemoryApiKey(settingsData?.memoryApiKey as string | undefined);
    const containerTag = `user_${uid}`;

    const operations: Promise<unknown>[] = [
      Promise.resolve(supabase.from('user_memory').delete().eq('user_id', uid)),
    ];

    if (memoryApiKey) {
      const client = new Supermemory({ apiKey: memoryApiKey });
      operations.push(
        client.documents.deleteBulk({
          containerTags: [containerTag],
        }),
      );
    }

    const results = await Promise.allSettled(operations);
    const failed = results.filter((result) => result.status === 'rejected');

    if (failed.length > 0) {
      failed.forEach((result) => {
        if (result.status === 'rejected') {
          console.error('[user/memories] Failed to clear user memories:', result.reason);
        }
      });
      return NextResponse.json({ error: 'Failed to clear memories' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleUserError(err, 'user/memories DELETE');
  }
}
