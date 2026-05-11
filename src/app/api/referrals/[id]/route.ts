import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, context: RouteContext) {
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
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  }

  const { data } = await supabase
    .from('referrals')
    .select(`
      id, status, match_score, message, created_at, decided_at,
      applications!from_application_id(
        applicants!applicant_id(name, email)
      ),
      job_postings!to_job_posting_id(title),
      profiles!from_recruiter_id(full_name)
    `)
    .eq('id', id)
    .eq('to_recruiter_id', profile.id)
    .single()

  if (!data) {
    return NextResponse.json({ error: 'Referral not found' }, { status: 404 })
  }

  return NextResponse.json({ referral: data })
}
