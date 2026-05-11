import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const { auth } = await import('@clerk/nextjs/server')
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()

    // Get user profile to determine organization scope
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('clerk_user_id', userId)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    }

    // Consolidated query using embeddings. 
    // Note the '!recruiter_id' to disambiguate multiple relations to 'profiles'
    const { data: jobPostings, error } = await supabase
      .from('job_postings')
      .select(`
        id, 
        title, 
        criteria, 
        status,
        recruiter:profiles!recruiter_id(full_name),
        applications (
          status,
          ai_tier
        )
      `)
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Supabase error fetching job_postings:', error)
      return NextResponse.json({ error: error.message || 'Failed to load jobs' }, { status: 500 })
    }

    const processedJobs = (jobPostings || []).map((job: any) => {
      const jobApps = job.applications || []
      return {
        id: job.id,
        title: job.title,
        recruiter: (job.recruiter as any)?.full_name,
        department: job.criteria?.department || 'General',
        applicantsCount: jobApps.length,
        newApplicantsCount: jobApps.filter((a: any) => a.status === 'new').length,
        stats: {
          top: jobApps.filter((a: any) => a.ai_tier === 'top').length,
          strong: jobApps.filter((a: any) => a.ai_tier === 'strong').length,
          review: jobApps.filter((a: any) => a.ai_tier === 'review').length,
          rejected: jobApps.filter((a: any) => a.ai_tier === 'auto_reject').length,
        },
        referralOpportunities: 0,
      }
    })

    return NextResponse.json(processedJobs)
  } catch (err) {
    console.error('Error in GET /api/jobs:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { auth } = await import('@clerk/nextjs/server')
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { title, description, department } = body
    if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

    const supabase = createAdminClient()

    // Look up the org and profile for this Clerk user
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, org_id')
      .eq('clerk_user_id', userId)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found. Ensure your account is fully set up.' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('job_postings')
      .insert([{
        title,
        description: description || null,
        org_id: profile.org_id,
        recruiter_id: profile.id,
        criteria: department ? { department } : {},
        status: 'open',
      }])
      .select()

    if (error) {
      console.error('Supabase error creating job_posting:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data?.[0] || null)
  } catch (err) {
    console.error('Error in POST /api/jobs:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
