import { createAdminClient } from '@/lib/supabase/admin'
import { ensureProfile } from '@/lib/ensure-profile'
import { parseImportFile, extractNameFromText, extractEmailFromText } from '@/lib/parseImport'
import { processBatch } from '@/lib/triage/batchTriage'
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

    // 4. Upsert applicant records
    const applicantRows = extracted.map((c) => ({
      name: extractNameFromText(c.resumeText, c.filename),
      email: extractEmailFromText(c.resumeText),
      org_id: profile.org_id,
    }))

    const { data: inserted, error: insertError } = await supabase
      .from('applicants')
      .insert(applicantRows)
      .select('id')

    if (insertError || !inserted) {
      console.error('Applicant insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create applicant records' }, { status: 500 })
    }

    // 5. Build candidate list for triage (id from DB, text from parsed file)
    const candidates = inserted.map((row, i) => ({
      id: row.id as string,
      resume_text: extracted[i].resumeText,
    }))

    // 6. Run AI triage — writes results to applications table
    const batchResult = await processBatch(
      candidates,
      { id: job.id, title: job.title, criteria: job.criteria ?? {} },
      profile.org_id,
      supabase
    )

    // 7. Back-fill parsed_resume onto applicant rows from triage results
    const parsedUpdates = batchResult.results
      .filter((r) => r.parsed_resume != null)
      .map((r) => supabase
        .from('applicants')
        .update({ parsed_resume: r.parsed_resume })
        .eq('id', r.candidate_id)
      )

    await Promise.allSettled(parsedUpdates)

    return NextResponse.json({
      path,
      processed: batchResult.processed,
      failed: batchResult.failed,
      total: extracted.length,
    })
  } catch (err) {
    console.error('Error in POST /api/import:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
