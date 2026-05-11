import { createAdminClient } from '@/lib/supabase/admin'
import { APPLICATION_STATUSES, type ApplicationStatus } from '@/lib/validation/inputValidation'
import { NextResponse } from 'next/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
      .select('name, email, phone, resume_text, parsed_resume')
      .eq('id', app.applicant_id)
      .single()

    const applicant: {
      name?: string
      email?: string
      phone?: string
      resume_text?: string
      parsed_resume?: { current_role?: string; location?: string }
    } = applicantRow ?? {}
    const reasoning = app.ai_reasoning || {}

    const processed = {
      id: app.id,
      jobId: app.job_posting_id,
      status: app.status,
      aiTier: app.ai_tier,
      matchScore: app.ai_score,
      insights: reasoning.matched || [],
      aiSummary: reasoning.summary || null,
      candidate: {
        name: applicant.name || 'Unknown',
        currentRole: applicant.parsed_resume?.current_role || '',
        email: applicant.email || '',
        phone: applicant.phone || '',
        location: applicant.parsed_resume?.location || '',
        resumeText: applicant.resume_text || null,
      },
      hasPreferredQualifications: !!(reasoning.preferred_hits?.length),
      preferredNote: reasoning.preferred_hits?.join(', ') || null,
      referralMatch: reasoning.referral_match || null,
    }

    return NextResponse.json(processed)
  } catch (err) {
    console.error('Error in GET /api/applications/[id]:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await req.json()
    const { action, data } = body
    const supabase = createAdminClient()

    if (action === 'update_status') {
      const { status } = data
      if (!APPLICATION_STATUSES.includes(status as ApplicationStatus)) {
        return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 })
      }
      const { error } = await supabase
        .from('applications')
        .update({ status: status as ApplicationStatus })
        .eq('id', id)
      if (error) return NextResponse.json({ error }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'advance') {
      const { stage } = data || {}
      const { error } = await supabase
        .from('applications')
        .update({ status: 'referred' satisfies ApplicationStatus, decided_at: new Date().toISOString() })
        .eq('id', id)
      if (error) return NextResponse.json({ error }, { status: 500 })
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