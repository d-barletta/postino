import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

let _admin: ReturnType<typeof createClient<Database>> | null = null;

/** Service-role Supabase client — bypasses RLS. Server-side only. */
export function createAdminClient() {
  if (!_admin) {
    _admin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return _admin;
}
