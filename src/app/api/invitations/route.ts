import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { applicationId, proposedSlots, interviewType } = body

    if (!applicationId || !Array.isArray(proposedSlots) || proposedSlots.length === 0) {
      return NextResponse.json({ error: 'applicationId and proposedSlots are required' }, { status: 400 })
    }

    const token = randomUUID()
    const supabase = createAdminClient()

    // Strip client-side ids from slots before storing
    const cleanSlots = proposedSlots.map(({ date, time }: { date: string; time: string }) => ({ date, time }))

    const { data, error } = await supabase
      .from('interview_invitations')
      .insert({
        application_id: applicationId,
        token,
        proposed_slots: cleanSlots,
        status: 'pending',
      })
      .select('id, token')
      .single()

    if (error) {
      console.error('Supabase error creating invitation:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const bookingUrl = `/booking.html?token=${token}`
    return NextResponse.json({ id: data.id, token: data.token, bookingUrl })
  } catch (err) {
    console.error('Error in POST /api/invitations:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
