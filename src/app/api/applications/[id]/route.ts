import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id
  try {
    const supabase = createAdminClient()

    const { data: app, error } = await supabase
      .from('applications')
      .select('id, applicant_id, job_posting_id, status, ai_tier, ai_score, ai_reasoning')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Supabase error fetching application:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: applicantRow } = await supabase
      .from('applicants')
      .select('name, email, phone, parsed_resume')
      .eq('id', app.applicant_id)
      .single()

    const applicant = applicantRow || {}
    const reasoning = app.ai_reasoning || {}

    const processed = {
      id: app.id,
      jobId: app.job_posting_id,
      status: app.status,
      aiTier: app.ai_tier,
      matchScore: app.ai_score,
      insights: reasoning.insights || [],
      aiSummary: reasoning.summary || null,
      candidate: {
        name: applicant.name || 'Unknown',
        currentRole: applicant.parsed_resume?.current_role || '',
        email: applicant.email || '',
        phone: applicant.phone || '',
        location: applicant.parsed_resume?.location || '',
      },
      hasPreferredQualifications: !!reasoning.has_preferred_qualifications,
      preferredNote: reasoning.preferred_note || null,
      referralMatch: reasoning.referral_match || null,
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
    const supabase = createAdminClient()

    if (action === 'update_status') {
      const { status } = data
      const { error } = await supabase
        .from('applications')
        .update({ status })
        .eq('id', id)
      if (error) return NextResponse.json({ error }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'advance') {
      const { stage } = data || {}
      const { error } = await supabase
        .from('applications')
        .update({ status: 'advanced', decided_at: new Date().toISOString() })
        .eq('id', id)
      if (error) return NextResponse.json({ error }, { status: 500 })
      // Record in communications if stage provided
      if (stage) {
        await supabase.from('communications').insert({
          application_id: id,
          type: 'advance',
          subject: `Advanced to ${stage}`,
          body: stage,
        })
      }
      return NextResponse.json({ ok: true })
    }

    if (action === 'add_note') {
      const { note } = data || {}
      if (!note) return NextResponse.json({ error: 'note is required' }, { status: 400 })
      const { error } = await supabase.from('communications').insert({
        application_id: id,
        type: 'custom',
        subject: 'Internal Note',
        body: note,
      })
      if (error) return NextResponse.json({ error }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('Error in POST /api/applications/[id]:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
