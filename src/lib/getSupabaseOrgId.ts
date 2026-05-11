import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Resolve a Clerk org ID (e.g. "org_3DaCAywZ4XTG1JCi9b3HM2HkMs9") to the
 * corresponding Supabase UUID stored in the organizations table.
 *
 * Returns null when no matching organisation row exists, which should be
 * treated as a 404 by the caller.
 */
export async function getSupabaseOrgId(
  supabase: SupabaseClient,
  clerkOrgId: string
): Promise<string | null> {
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('clerk_org_id', clerkOrgId)
    .single()
  return org?.id ?? null
}
