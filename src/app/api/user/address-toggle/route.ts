import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';

export async function PATCH(request: NextRequest) {
  try {
    const user = await verifyUserRequest(request);

    const body = await request.json();
    if (typeof body.isAddressEnabled !== 'boolean') {
      return NextResponse.json({ error: 'isAddressEnabled must be a boolean' }, { status: 400 });
    }

    const supabase = createAdminClient();
    await supabase
      .from('users')
      .update({ is_address_enabled: body.isAddressEnabled })
      .eq('id', user.id);

    return NextResponse.json({ success: true, isAddressEnabled: body.isAddressEnabled });
  } catch (error) {
    return handleUserError(error, 'user/address-toggle PATCH');
  }
}
