import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const { auth } = await import('@clerk/nextjs/server')
    const { orgId } = await auth()
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('referrals')
      .select('*, job_postings(title), profiles:from_recruiter_id(*)')
      .eq('to_recruiter_id', orgId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Supabase error fetching referrals:', error)
      return NextResponse.json({ error: error.message || error }, { status: 500 })
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
    const { orgId, userId } = await auth()
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { from_application_id, to_job_posting_id, to_recruiter_id, match_score, message } = body
    if (!from_application_id || !to_job_posting_id || !to_recruiter_id) {
      return NextResponse.json({ error: 'missing required fields' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('referrals')
      .insert([{ from_application_id, to_job_posting_id, from_recruiter_id: userId, to_recruiter_id, match_score, message }])
      .select()

    if (error) {
      console.error('Supabase error creating referral:', error)
      return NextResponse.json({ error: error.message || error }, { status: 500 })
    }

    return NextResponse.json(data?.[0] || null)
  } catch (err) {
    console.error('Error in POST /api/referrals:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
