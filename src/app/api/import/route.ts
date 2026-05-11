import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { auth } = await import('@clerk/nextjs/server')
    const { orgId } = await auth()
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File
    const jobId = formData.get('job_id') as string

    if (!file || !jobId) return NextResponse.json({ error: 'file and job_id required' }, { status: 400 })

    const supabase = await createClient()

    // upload to 'imports' bucket
    const path = `${orgId}/${jobId}/${Date.now()}-${file.name}`
    const { data, error } = await supabase.storage.from('imports').upload(path, file)
    if (error) {
      console.error('Supabase storage upload error:', error)
      return NextResponse.json({ error: error.message || error }, { status: 500 })
    }

    // enqueue import job
    const { triageQueue } = await import('@/lib/queue')
    await triageQueue.add('import-applicants', { orgId, jobId, path: data.path, fileName: file.name })

    return NextResponse.json({ path: data.path })
  } catch (err) {
    console.error('Error in POST /api/import:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
