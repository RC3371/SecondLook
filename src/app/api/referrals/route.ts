import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const { auth } = await import('@clerk/nextjs/server')
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()

    // Look up the profile UUID for this Clerk user
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('clerk_user_id', userId)
      .single()

    if (!profile) return NextResponse.json([])

    const { data, error } = await supabase
      .from('referrals')
      .select('id, from_application_id, to_job_posting_id, from_recruiter_id, status, match_score, message, created_at')
      .eq('to_recruiter_id', profile.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Supabase error fetching referrals:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (err) {
    console.error('Error in GET /api/referrals:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { auth } = await import('@clerk/nextjs/server')
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { from_application_id, to_job_posting_id, message } = body
    if (!from_application_id || !to_job_posting_id) {
      return NextResponse.json({ error: 'from_application_id and to_job_posting_id are required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: fromProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('clerk_user_id', userId)
      .single()

    if (!fromProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    }

    // Look up the recruiter for the target job
    const { data: targetJob } = await supabase
      .from('job_postings')
      .select('recruiter_id')
      .eq('id', to_job_posting_id)
      .single()

    const toRecruiterId = targetJob?.recruiter_id || fromProfile.id

    const { data, error } = await supabase
      .from('referrals')
      .insert([{
        from_application_id,
        to_job_posting_id,
        from_recruiter_id: fromProfile.id,
        to_recruiter_id: toRecruiterId,
        message: message || null,
      }])
      .select()

    if (error) {
      console.error('Supabase error creating referral:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data?.[0] || null)
  } catch (err) {
    console.error('Error in POST /api/referrals:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
