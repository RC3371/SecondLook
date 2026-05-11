import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('applications')
      .select('*, candidates(*)')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Supabase error fetching application:', error)
      return NextResponse.json({ error: error.message || error }, { status: 500 })
    }

    const app = data
    const processed = {
      id: app.id,
      jobId: app.job_id,
      status: app.status,
      aiTier: app.ai_tier,
      matchScore: app.match_score,
      insights: app.insights || [],
      aiSummary: app.ai_summary || null,
      candidate: app.candidates || {
        name: app.candidate_name || 'Unknown',
        currentRole: app.candidate_current_role || '',
        email: app.candidate_email || '',
        phone: app.candidate_phone || '',
        location: app.candidate_location || '',
      },
      hasPreferredQualifications: !!app.has_preferred_qualifications,
      preferredNote: app.preferred_note || null,
      referralMatch: app.referral_match || null,
    }

    return NextResponse.json(processed)
  } catch (err) {
    console.error('Error in GET /api/applications/[id]:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = params.id
  try {
    const body = await req.json()
    const { action, data } = body
    const supabase = await createClient()

    if (action === 'update_status') {
      const { status } = data
      const { error } = await supabase
        .from('applications')
        .update({ status })
        .eq('id', id)

      if (error) return NextResponse.json({ error }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // Add other actions as needed (advance, refer, add_note)
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('Error in POST /api/applications/[id]:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
