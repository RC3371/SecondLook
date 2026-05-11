import { createClient } from '@supabase/supabase-js'
import { normalizeSupabaseUrl } from './url'

// Service-role client for API routes — bypasses RLS.
// Never expose this client to the browser.
export function createAdminClient() {
  return createClient(
    normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
