import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const jobId = params.id
  try {
    const supabase = createAdminClient()

    const { data: applications, error } = await supabase
      .from('applications')
      .select('id, applicant_id, job_posting_id, status, ai_tier, ai_score, ai_reasoning')
      .eq('job_posting_id', jobId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Supabase error fetching applications:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Fetch applicants separately
    const applicantIds = (applications || []).map((a: any) => a.applicant_id).filter(Boolean)
    const { data: applicants } = applicantIds.length
      ? await supabase.from('applicants').select('id, name, email, phone, parsed_resume').in('id', applicantIds)
      : { data: [] }

    const applicantMap = Object.fromEntries((applicants || []).map((a: any) => [a.id, a]))

    const processed = (applications || []).map((a: any) => {
      const applicant = applicantMap[a.applicant_id] || {}
      const reasoning = a.ai_reasoning || {}
      return {
        id: a.id,
        jobId: a.job_posting_id,
        status: a.status,
        aiTier: a.ai_tier,
        matchScore: a.ai_score,
        insights: reasoning.insights || [],
        aiSummary: reasoning.summary || null,
        candidate: {
          name: applicant.name || 'Unknown',
          currentRole: applicant.parsed_resume?.current_role || '',
          email: applicant.email || '',
          phone: applicant.phone || '',
          location: applicant.parsed_resume?.location || '',
        },
        hasPreferredQualifications: !!reasoning.has_preferred_qualifications,
        preferredNote: reasoning.preferred_note || null,
        referralMatch: reasoning.referral_match || null,
      }
    })

    return NextResponse.json(processed)
  } catch (err) {
    console.error('Error in GET /api/jobs/[id]/applications:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
