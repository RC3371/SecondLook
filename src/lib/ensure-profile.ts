import { auth, clerkClient, currentUser } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Returns the Supabase profile for the current Clerk user.
 * If no profile exists yet (e.g. webhook never fired), auto-provisions
 * the org + profile using Clerk API data.
 * Returns null if unauthenticated or no active org.
 */
export async function ensureProfile(): Promise<{ id: string; org_id: string } | null> {
  const { userId, orgId } = await auth()
  if (!userId) return null

  const supabase = createAdminClient()

  // Fast path: profile already exists
  const { data: existing } = await supabase
    .from('profiles')
    .select('id, org_id')
    .eq('clerk_user_id', userId)
    .single()

  if (existing) return existing

  // Slow path: provision on first hit
  if (!orgId) return null // Need an active org context

  const clerk = await clerkClient()

  // Get or create the org row in Supabase
  let { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('clerk_org_id', orgId)
    .single()

  if (!org) {
    const clerkOrg = await clerk.organizations.getOrganization({ organizationId: orgId })
    const { data: newOrg } = await supabase
      .from('organizations')
      .insert({ clerk_org_id: orgId, name: clerkOrg.name })
      .select('id')
      .single()
    org = newOrg
  }

  if (!org) return null

  const user = await currentUser()
  const email = user?.emailAddresses[0]?.emailAddress ?? ''
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || email

  // Determine role from Clerk membership
  let role = 'recruiter'
  try {
    const memberships = await clerk.organizations.getOrganizationMembershipList({ organizationId: orgId })
    const membership = memberships.data.find(m => m.publicUserData?.userId === userId)
    if (membership?.role === 'org:admin') role = 'admin'
  } catch {
    // Default to recruiter if we can't fetch membership
  }

  const { data: profile } = await supabase
    .from('profiles')
    .upsert(
      {
        id: crypto.randomUUID(),
        clerk_user_id: userId,
        org_id: org.id,
        email,
        full_name: fullName,
        role,
      },
      { onConflict: 'clerk_user_id' }
    )
    .select('id, org_id')
    .single()

  return profile ?? null
}
