/**
 * Dev-only endpoint to bootstrap a Clerk user into Supabase.
 * Creates an org + profile if neither exists yet.
 * Hit once after signing up: GET /api/provision
 */
import { auth, currentUser } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const clerkUser = await currentUser()
  const email = clerkUser?.emailAddresses[0]?.emailAddress ?? ''
  const fullName = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ') || email

  const supabase = createAdminClient()

  // Check if profile already exists
  const { data: existing } = await supabase
    .from('profiles')
    .select('id, org_id')
    .eq('clerk_user_id', userId)
    .single()

  if (existing) {
    return NextResponse.json({ message: 'Already provisioned', profile: existing })
  }

  // Create org
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({ clerk_org_id: `dev_${userId}`, name: `${fullName}'s Org` })
    .select('id')
    .single()

  if (orgError) {
    return NextResponse.json({ error: orgError.message }, { status: 500 })
  }

  // Create profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: crypto.randomUUID(),
      clerk_user_id: userId,
      org_id: org.id,
      email,
      full_name: fullName,
      role: 'admin',
    })
    .select('id')
    .single()

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json({ message: 'Provisioned successfully', profile })
}
