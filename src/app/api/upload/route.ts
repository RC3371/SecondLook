import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/security/rateLimit'
import { getSupabaseOrgId } from '@/lib/getSupabaseOrgId'
import { uploadFormInputSchema } from '@/lib/validation/inputValidation'

export async function POST(req: NextRequest) {
  const { orgId } = await auth()
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = checkRateLimit(`upload:${orgId}`, {
    limit: 30,
    windowMs: 60_000,
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    )
  }

  const formData = await req.formData()
  const parsedInput = uploadFormInputSchema.safeParse({
    file: formData.get('resume'),
    req_id: formData.get('req_id'),
  })
  if (!parsedInput.success) {
    return NextResponse.json({ error: 'Missing resume or req_id' }, { status: 400 })
  }

  const { file, req_id: reqId } = parsedInput.data

  const supabase = await createClient()

  const supabaseOrgId = await getSupabaseOrgId(supabase, orgId)
  if (!supabaseOrgId) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  }

  // Enforce org isolation: req_id must belong to the caller's org.
  const { data: reqRecord, error: reqError } = await supabase
    .from('requisitions')
    .select('id')
    .eq('id', reqId)
    .eq('org_id', supabaseOrgId)
    .single()

  if (reqError || !reqRecord) {
    return NextResponse.json({ error: 'Requisition not found' }, { status: 404 })
  }

  const fileName = `${orgId}/${reqId}/${Date.now()}-${file.name}`

  const { data, error } = await supabase.storage
    .from('resumes')
    .upload(fileName, file)

  if (error || !data) {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  try {
    // Queue triage job
    const { triageQueue } = await import('@/lib/queue')
    await triageQueue.add('triage-candidate', {
      orgId,
      reqId,
      resumePath: data.path,
      fileName: file.name,
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ path: data.path })
}
