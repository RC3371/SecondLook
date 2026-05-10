import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { orgId } = await auth()
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('resume') as File
  const reqId = formData.get('req_id') as string

  const supabase = await createClient()
  const fileName = `${orgId}/${reqId}/${Date.now()}-${file.name}`

  const { data, error } = await supabase.storage
    .from('resumes')
    .upload(fileName, file)

  if (error) return NextResponse.json({ error }, { status: 500 })

  // Queue triage job
  const { triageQueue } = await import('@/lib/queue')
  await triageQueue.add('triage-candidate', {
    orgId,
    reqId,
    resumePath: data.path,
    fileName: file.name,
  })

  return NextResponse.json({ path: data.path })
}