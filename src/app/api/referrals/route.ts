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
      .select(`
        id, status, match_score, message, created_at,
        applications!from_application_id(
          applicants!applicant_id(name)
        ),
        job_postings!to_job_posting_id(title),
        profiles!from_recruiter_id(full_name)
      `)
      .eq('to_recruiter_id', profile.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Supabase error fetching referrals:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const shaped = (data || []).map((r: any) => {
      const ageMs = Date.now() - new Date(r.created_at).getTime()
      const ageHours = Math.floor(ageMs / 3_600_000)
      const timeAgo = ageHours < 1 ? 'Just now'
        : ageHours < 24 ? `${ageHours}h ago`
        : `${Math.floor(ageHours / 24)}d ago`
      return {
        id: r.id,
        status: r.status,
        matchScore: r.match_score ?? 0,
        reasoning: r.message ?? '',
        timeAgo,
        candidateName: r.applications?.applicants?.name ?? 'Unknown',
        targetJob: r.job_postings?.title ?? 'Unknown',
        sourceRecruiter: r.profiles?.full_name ?? 'Unknown',
      }
    })

    return NextResponse.json(shaped)
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
