import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date')
    const supabase = createAdminClient()

    let dbQuery = supabase
      .from('interviews')
      .select('id, application_id, scheduled_at, interview_type')
      .order('scheduled_at', { ascending: true })

    if (date) {
      dbQuery = dbQuery
        .gte('scheduled_at', `${date}T00:00:00`)
        .lte('scheduled_at', `${date}T23:59:59`)
    }

    const { data: interviews, error } = await dbQuery
    if (error) {
      console.error('Supabase error fetching interviews:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const appIds = (interviews || []).map((i: any) => i.application_id).filter(Boolean)
    const { data: apps } = appIds.length
      ? await supabase.from('applications').select('id, applicant_id, job_posting_id').in('id', appIds)
      : { data: [] }

    const applicantIds = (apps || []).map((a: any) => a.applicant_id).filter(Boolean)
    const jobIds = [...new Set((apps || []).map((a: any) => a.job_posting_id).filter(Boolean))]

    const [{ data: applicants }, { data: jobs }] = await Promise.all([
      applicantIds.length
        ? supabase.from('applicants').select('id, name').in('id', applicantIds)
        : Promise.resolve({ data: [] }),
      jobIds.length
        ? supabase.from('job_postings').select('id, title').in('id', jobIds as string[])
        : Promise.resolve({ data: [] }),
    ])

    const appMap = Object.fromEntries((apps || []).map((a: any) => [a.id, a]))
    const applicantMap = Object.fromEntries((applicants || []).map((a: any) => [a.id, a]))
    const jobMap = Object.fromEntries((jobs || []).map((j: any) => [j.id, j]))

    const result = (interviews || []).map((iv: any) => {
      const app = appMap[iv.application_id] || {}
      return {
        ...iv,
        applications: {
          id: app.id,
          candidates: applicantMap[app.applicant_id] || null,
          job_postings: jobMap[app.job_posting_id] || null,
        },
      }
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('Error in GET /api/interviews:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { applicationId, date, time, interviewType } = body
    if (!applicationId || !date || !time) {
      return NextResponse.json({ error: 'applicationId, date, and time are required' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const scheduledAt = new Date(`${date}T${time}:00`).toISOString()

    const { data, error } = await supabase
      .from('interviews')
      .insert([{ application_id: applicationId, scheduled_at: scheduledAt, interview_type: interviewType || 'Recruiter Screen' }])
      .select()

    if (error) {
      console.error('Supabase error creating interview:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data?.[0] || null)
  } catch (err) {
    console.error('Error in POST /api/interviews:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
