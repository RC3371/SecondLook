import { createAdminClient } from '@/lib/supabase/admin'
import { ensureProfile } from '@/lib/ensure-profile'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const profile = await ensureProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File
    const jobId = formData.get('job_id') as string

    if (!file || !jobId) return NextResponse.json({ error: 'file and job_id required' }, { status: 400 })

    const supabase = createAdminClient()

    const path = `${profile.org_id}/${jobId}/${Date.now()}-${file.name}`
    const { data, error } = await supabase.storage.from('resumes').upload(path, file)
    if (error) {
      console.error('Supabase storage upload error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // TODO: enqueue triage job once Redis is configured with a rediss:// URL
    console.log('File uploaded, triage queue not yet wired:', data.path)

    return NextResponse.json({ path: data.path })
  } catch (err) {
    console.error('Error in POST /api/import:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
