import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const jobId = params.id
  try {
    const supabase = await createClient()

    const { data: applications, error } = await supabase
      .from('applications')
      .select('*, candidates(*)')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Supabase error fetching applications:', error)
      return NextResponse.json({ error: error.message || error }, { status: 500 })
    }

    const processed = (applications || []).map((a: any) => ({
      id: a.id,
      jobId: a.job_id,
      status: a.status,
      aiTier: a.ai_tier,
      matchScore: a.match_score,
      insights: a.insights || [],
      aiSummary: a.ai_summary || null,
      candidate: a.candidates || {
        name: a.candidate_name || 'Unknown',
        currentRole: a.candidate_current_role || '',
        email: a.candidate_email || '',
        phone: a.candidate_phone || '',
        location: a.candidate_location || '',
      },
      hasPreferredQualifications: !!a.has_preferred_qualifications,
      preferredNote: a.preferred_note || null,
      referralMatch: a.referral_match || null,
    }))

    return NextResponse.json(processed)
  } catch (err) {
    console.error('Error in GET /api/jobs/[id]/applications:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
