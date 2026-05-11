import { createAdminClient } from '@/lib/supabase/admin'
import { ensureProfile } from '@/lib/ensure-profile'
import { parseImportFile, extractNameFromText, extractEmailFromText } from '@/lib/parseImport'
import { type ApplicationStatus } from '@/lib/validation/inputValidation'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const profile = await ensureProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File
    const jobId = formData.get('job_id') as string

    if (!file || !jobId) return NextResponse.json({ error: 'file and job_id required' }, { status: 400 })

    const supabase = createAdminClient()

    // 1. Look up the job posting (scoped to org)
    const { data: job, error: jobError } = await supabase
      .from('job_postings')
      .select('id, title, criteria')
      .eq('id', jobId)
      .eq('org_id', profile.org_id)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // 2. Upload raw file to storage for audit trail
    const path = `${profile.org_id}/${jobId}/${Date.now()}-${file.name}`
    const { error: uploadError } = await supabase.storage.from('resumes').upload(path, file)
    if (uploadError) {
      console.error('Supabase storage upload error:', uploadError)
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    // 3. Parse the file into individual resume texts
    const buffer = Buffer.from(await file.arrayBuffer())
    const extracted = await parseImportFile(buffer, file.name)

    if (!extracted.length) {
      return NextResponse.json({ error: 'No readable resumes found in file' }, { status: 400 })
    }

    // 4. Insert applicant records (with resume text for later triage)
    const applicantRows = extracted.map((c) => ({
      name: extractNameFromText(c.resumeText, c.filename),
      email: extractEmailFromText(c.resumeText),
      org_id: profile.org_id,
      resume_text: c.resumeText,
    }))

    const { data: inserted, error: insertError } = await supabase
      .from('applicants')
      .insert(applicantRows)
      .select('id')

    if (insertError || !inserted) {
      console.error('Applicant insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create applicant records' }, { status: 500 })
    }

    // 5. Create application records in pending_consent state.
    // Triage runs later via /api/triage, but only after consent_given.
    const consentExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

    const applicationRows = inserted.map((row) => ({
      applicant_id: row.id,
      job_posting_id: jobId,
      status: 'pending_consent' satisfies ApplicationStatus,
      consent_expires_at: consentExpiresAt,
    }))

    const { error: appInsertError } = await supabase
      .from('applications')
      .insert(applicationRows)

    if (appInsertError) {
      console.error('Application insert error:', appInsertError)
      return NextResponse.json({ error: 'Failed to create application records' }, { status: 500 })
    }

    return NextResponse.json({
      path,
      queued: inserted.length,
      total: extracted.length,
    })
  } catch (err) {
    console.error('Error in POST /api/import:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
