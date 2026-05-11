import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, context: RouteContext) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const supabase = createAdminClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('clerk_user_id', userId)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: referral } = await supabase
    .from('referrals')
    .select('id, to_recruiter_id, status')
    .eq('id', id)
    .single()

  if (!referral) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (referral.to_recruiter_id !== profile.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (referral.status !== 'pending') {
    return NextResponse.json({ error: 'Referral is not pending' }, { status: 400 })
  }

  const { error } = await supabase
    .from('referrals')
    .update({ status: 'declined', decided_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
