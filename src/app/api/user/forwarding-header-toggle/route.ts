import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';

export async function PATCH(request: NextRequest) {
  try {
    const user = await verifyUserRequest(request);

    const body = await request.json();
    if (typeof body.isForwardingHeaderEnabled !== 'boolean') {
      return NextResponse.json(
        { error: 'isForwardingHeaderEnabled must be a boolean' },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    await supabase
      .from('users')
      .update({ is_forwarding_header_enabled: body.isForwardingHeaderEnabled })
      .eq('id', user.id);

    return NextResponse.json({
      success: true,
      isForwardingHeaderEnabled: body.isForwardingHeaderEnabled,
    });
  } catch (error) {
    return handleUserError(error, 'user/forwarding-header-toggle PATCH');
  }
}
