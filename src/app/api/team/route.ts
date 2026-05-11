import { auth, clerkClient } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureProfile } from '@/lib/ensure-profile'
import { NextResponse } from 'next/server'

async function getCallerProfile(userId: string, orgId: string) {
  const profile = await ensureProfile()
  if (!profile) return null

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('clerk_user_id', userId)
    .eq('org_id', profile.org_id)
    .single()

  return { ...profile, role: data?.role ?? 'recruiter' }
}

export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const profile = await ensureProfile()
  if (!profile) return NextResponse.json({ error: 'No profile found' }, { status: 403 })

  const supabase = createAdminClient()
  const clerk = await clerkClient()

  const [{ data: members }, invitationList] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, clerk_user_id, full_name, email, role')
      .eq('org_id', profile.org_id)
      .order('full_name'),
    clerk.organizations.getOrganizationInvitationList({
      organizationId: orgId,
      status: ['pending'],
    }),
  ])

  const currentUserRole = members?.find(m => m.clerk_user_id === userId)?.role ?? 'recruiter'

  return NextResponse.json({
    members: members ?? [],
    invitations: invitationList.data.map(inv => ({
      id: inv.id,
      email: inv.emailAddress,
      role: inv.role,
    })),
    currentUserRole,
    currentUserId: userId,
  })
}

export async function POST(req: Request) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const caller = await getCallerProfile(userId, orgId)
  if (!caller) return NextResponse.json({ error: 'No profile found' }, { status: 403 })
  if (caller.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const clerk = await clerkClient()

  if (body.action === 'invite') {
    const { email, role } = body
    if (!email || !role) return NextResponse.json({ error: 'Missing email or role' }, { status: 400 })

    const redirectUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/sign-in`
      : `${req.headers.get('origin') ?? ''}/sign-in`

    await clerk.organizations.createOrganizationInvitation({
      organizationId: orgId,
      emailAddress: email,
      role,
      redirectUrl,
    })

    return NextResponse.json({ success: true })
  }

  if (body.action === 'change_role') {
    const { userId: targetUserId, role } = body
    if (!targetUserId || !role) return NextResponse.json({ error: 'Missing userId or role' }, { status: 400 })

    const supabase = createAdminClient()
    const supabaseRole = role === 'org:admin' ? 'admin' : 'recruiter'

    await Promise.all([
      clerk.organizations.updateOrganizationMembership({
        organizationId: orgId,
        userId: targetUserId,
        role,
      }),
      supabase
        .from('profiles')
        .update({ role: supabaseRole })
        .eq('clerk_user_id', targetUserId)
        .eq('org_id', caller.org_id),
    ])

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function DELETE(req: Request) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const caller = await getCallerProfile(userId, orgId)
  if (!caller) return NextResponse.json({ error: 'No profile found' }, { status: 403 })
  if (caller.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId: targetUserId } = await req.json()
  if (!targetUserId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const supabase = createAdminClient()
  const clerk = await clerkClient()

  await Promise.all([
    clerk.organizations.deleteOrganizationMembership({
      organizationId: orgId,
      userId: targetUserId,
    }),
    supabase
      .from('profiles')
      .delete()
      .eq('clerk_user_id', targetUserId)
      .eq('org_id', caller.org_id),
  ])

  return NextResponse.json({ success: true })
}
