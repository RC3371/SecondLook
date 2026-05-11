import { createClient } from '@/lib/supabase/server'
import { MOCK_JOBS } from '@/lib/mock-data'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: jobPostings, error } = await supabase
      .from('job_postings')
      .select('*, applications(id, status, ai_tier)')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Supabase error fetching job_postings:', error)
      // fallback to mock data so UI remains functional in dev
      const processed = (MOCK_JOBS || []).map((job: any) => ({
        id: job.id,
        title: job.title,
        department: job.department || 'Engineering',
        applicantsCount: job.applicantsCount || 0,
        newApplicantsCount: job.newApplicantsCount || 0,
        stats: job.stats || { top: 0, strong: 0, review: 0, rejected: 0 },
        referralOpportunities: job.referralOpportunities || 0,
      }))
      return NextResponse.json(processed)
    }

    const processedJobs = (jobPostings || []).map((job: any) => {
      const apps = job.applications || []
      const newApps = apps.filter((a: any) => a.status === 'new').length
      const topApps = apps.filter((a: any) => a.ai_tier === 'top').length
      const strongApps = apps.filter((a: any) => a.ai_tier === 'strong').length
      const reviewApps = apps.filter((a: any) => a.ai_tier === 'review').length
      const rejectedApps = apps.filter((a: any) => a.ai_tier === 'auto_reject').length

      return {
        id: job.id,
        title: job.title,
        department: job.department || 'Engineering',
        applicantsCount: apps.length,
        newApplicantsCount: newApps,
        stats: { top: topApps, strong: strongApps, review: reviewApps, rejected: rejectedApps },
        referralOpportunities: 0
      }
    })

    return NextResponse.json(processedJobs)
  } catch (err) {
      console.error('Error in /api/jobs:', err)
      // final fallback to mock jobs
      return NextResponse.json((MOCK_JOBS || []))
  }
}

export async function POST(req: Request) {
  try {
    // create job posting; require auth
    const { auth } = await import('@clerk/nextjs/server')
    const { orgId, userId } = await auth()
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { title, description, department, recruiter_id } = body

    if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('job_postings')
      .insert([{ title, description: description || null, org_id: orgId, recruiter_id: recruiter_id || userId, department }])
      .select()

    if (error) {
      console.error('Supabase error creating job_posting:', error)
      return NextResponse.json({ error: error.message || error }, { status: 500 })
    }

    return NextResponse.json(data?.[0] || null)
  } catch (err) {
    console.error('Error in POST /api/jobs:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
