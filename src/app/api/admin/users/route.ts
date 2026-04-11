import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdminRequest, handleAdminError } from '@/lib/api-auth';

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 100;

export async function GET(request: NextRequest) {
  try {
    await verifyAdminRequest(request);
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    const pageSizeParam = parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, isNaN(pageSizeParam) ? DEFAULT_PAGE_SIZE : pageSizeParam),
    );
    // cursor is the last document ID from the previous page
    const cursor = searchParams.get('cursor');

    let q: any = supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(pageSize + 1);

    if (cursor) {
      const { data: cursorRow } = await supabase
        .from('users')
        .select('created_at')
        .eq('id', cursor)
        .single();
      if (cursorRow) {
        q = q.lt('created_at', cursorRow.created_at);
      }
    }

    const { data: rows } = await q;
    const hasNextPage = (rows?.length ?? 0) > pageSize;
    const pageDocs = hasNextPage ? (rows ?? []).slice(0, pageSize) : (rows ?? []);
    const nextCursor = hasNextPage ? pageDocs[pageDocs.length - 1].id : null;

    const users = pageDocs.map((d: Record<string, unknown>) => ({
      uid: d.id,
      email: d.email,
      assignedEmail: d.assigned_email,
      isAdmin: d.is_admin,
      isActive: d.is_active,
      suspended: d.suspended,
      displayName: d.display_name,
      analysisOutputLanguage: d.analysis_output_language,
      isAddressEnabled: d.is_address_enabled,
      isAiAnalysisOnlyEnabled: d.is_ai_analysis_only_enabled,
      isForwardingHeaderEnabled: d.is_forwarding_header_enabled,
      createdAt: d.created_at ?? null,
    }));

    return NextResponse.json({ users, hasNextPage, nextCursor });
  } catch (error) {
    return handleAdminError(error, 'admin/users GET');
  }
}
