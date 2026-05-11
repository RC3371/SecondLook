import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { type ApplicationStatus } from '@/lib/validation/inputValidation'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params

  // 1. Auth
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  try {
    // 2. Resolve org via profile (same path used by import/route.ts and POST /api/jobs)
    //    getSupabaseOrgId() looks up organizations.clerk_org_id, which can diverge from
    //    profile.org_id when the org row predates the clerk_org_id column being populated.
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('clerk_user_id', userId)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    }

    // 3. Verify the job posting belongs to this org
    const { data: job, error: jobError } = await supabase
      .from('job_postings')
      .select('id, title, status, criteria, created_at')
      .eq('id', jobId)
      .eq('org_id', profile.org_id)
      .single()

    if (jobError) {
      // PGRST116 = no rows returned; anything else is a real DB error
      if (jobError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      }
      console.error('Error fetching job posting', jobId, jobError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // 3. Fetch applications joined with applicant data, best scores first
    const { data: rows, error: appsError } = await supabase
      .from('applications')
      .select(`
        id,
        status,
        ai_tier,
        ai_score,
        ai_reasoning,
        consent_expires_at,
        consent_responded_at,
        created_at,
        applicants (
          id,
          name,
          email,
          resume_text,
          parsed_resume
        )
      `)
      .eq('job_posting_id', jobId)
      .order('ai_score', { ascending: false, nullsFirst: false })

    if (appsError) {
      console.error('Error fetching applications for job', jobId, appsError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // 4. Shape into the response the frontend expects
    const applications = (rows ?? []).map((a: any) => {
      const applicant = (a.applicants as any) ?? {}
      const reasoning = (a.ai_reasoning as any) ?? {}
      return {
        id: a.id,
        status: a.status as ApplicationStatus,
        aiTier: a.ai_tier,
        matchScore: a.ai_score,
        insights: reasoning.matched ?? [],
        aiSummary: reasoning.summary ?? null,
        consentExpiresAt: a.consent_expires_at ?? null,
        consentRespondedAt: a.consent_responded_at ?? null,
        createdAt: a.created_at,
        candidate: {
          id: applicant.id ?? null,
          name: applicant.name ?? 'Unknown',
          email: applicant.email ?? '',
          currentRole: applicant.parsed_resume?.current_role ?? '',
          location: applicant.parsed_resume?.location ?? '',
          resumeText: applicant.resume_text ?? null,
          parsedResume: applicant.parsed_resume ?? null,
        },
        hasPreferredQualifications: !!(reasoning.preferred_hits?.length),
        preferredNote: reasoning.preferred_hits?.join(', ') ?? null,
        referralMatch: reasoning.referral_match ?? null,
      }
    })

    return NextResponse.json({ job, applications })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
