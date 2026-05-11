import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import { safeIdSchema, MAX_RECRUITER_NOTE_CHARS } from '@/lib/validation/inputValidation'

const sendSchema = z.object({
  from_application_id: safeIdSchema,
  to_job_posting_id: safeIdSchema,
  message: z.string().max(MAX_RECRUITER_NOTE_CHARS).optional(),
}).strict()

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = sendSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'from_application_id and to_job_posting_id are required UUIDs' }, { status: 400 })
  }

  const { from_application_id, to_job_posting_id, message } = parsed.data
  const supabase = createAdminClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id')
    .eq('clerk_user_id', userId)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Verify the source application belongs to this org
  const { data: sourceApp } = await supabase
    .from('applications')
    .select('id, job_postings!job_posting_id(org_id)')
    .eq('id', from_application_id)
    .single()

  if (!sourceApp) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  // Verify the target job belongs to this org
  const { data: targetJob } = await supabase
    .from('job_postings')
    .select('id, recruiter_id, org_id')
    .eq('id', to_job_posting_id)
    .eq('org_id', profile.org_id)
    .single()

  if (!targetJob) {
    return NextResponse.json({ error: 'Target job not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('referrals')
    .insert({
      from_application_id,
      to_job_posting_id,
      from_recruiter_id: profile.id,
      to_recruiter_id: targetJob.recruiter_id,
      message: message ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('Supabase error creating referral:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, referral: data })
}
