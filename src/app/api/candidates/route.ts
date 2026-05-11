import { createAdminClient } from '@/lib/supabase/admin'
import { ensureProfile } from '@/lib/ensure-profile'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  try {
    const profile = await ensureProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const query = searchParams.get('q') || ''
    const supabase = createAdminClient()

    // Get job posting IDs for this org
    const { data: orgJobs } = await supabase
      .from('job_postings')
      .select('id')
      .eq('org_id', profile.org_id)

    const orgJobIds = (orgJobs || []).map((j: any) => j.id)
    if (!orgJobIds.length) return NextResponse.json([])

    const { data: applications, error } = await supabase
      .from('applications')
      .select('id, applicant_id, job_posting_id, status, ai_tier, ai_score, ai_reasoning')
      .in('job_posting_id', orgJobIds)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Supabase error fetching candidates:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const applicantIds = (applications || []).map((a: any) => a.applicant_id).filter(Boolean)
    const jobIds = [...new Set((applications || []).map((a: any) => a.job_posting_id).filter(Boolean))]

    const [{ data: applicants }, { data: jobs }] = await Promise.all([
      applicantIds.length
        ? supabase.from('applicants').select('id, name, email, phone, parsed_resume').in('id', applicantIds)
        : Promise.resolve({ data: [] }),
      jobIds.length
        ? supabase.from('job_postings').select('id, title').in('id', jobIds)
        : Promise.resolve({ data: [] }),
    ])

    const applicantMap = Object.fromEntries((applicants || []).map((a: any) => [a.id, a]))
    const jobMap = Object.fromEntries((jobs || []).map((j: any) => [j.id, j]))

    const results = (applications || [])
      .map((a: any) => ({
        id: a.id,
        job_posting_id: a.job_posting_id,
        status: a.status,
        ai_tier: a.ai_tier,
        ai_score: a.ai_score,
        insights: a.ai_reasoning?.insights || [],
        candidates: applicantMap[a.applicant_id] || null,
        job_postings: jobMap[a.job_posting_id] || null,
      }))
      .filter((a: any) => {
        if (!query) return true
        const name = a.candidates?.name?.toLowerCase() || ''
        const role = a.candidates?.parsed_resume?.current_role?.toLowerCase() || ''
        const q = query.toLowerCase()
        return name.includes(q) || role.includes(q)
      })

    return NextResponse.json(results)
  } catch (err) {
    console.error('Error in GET /api/candidates:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
