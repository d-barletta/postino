import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/supabase';

let _browser: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (!_browser) {
    _browser = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
  }
  return _browser;
}
