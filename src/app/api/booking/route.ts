import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const token = searchParams.get('token')
    if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 })

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('interview_invitations')
      .select('id, application_id, proposed_slots, confirmed_slot_id, status')
      .eq('token', token)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Invalid or expired booking link' }, { status: 404 })
    }
    return NextResponse.json(data)
  } catch (err) {
    console.error('Error in GET /api/booking:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { token, slotId } = body
    if (!token || !slotId) {
      return NextResponse.json({ error: 'token and slotId are required' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { error } = await supabase
      .from('interview_invitations')
      .update({ confirmed_slot_id: slotId, status: 'confirmed' })
      .eq('token', token)

    if (error) {
      console.error('Supabase error confirming booking:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error in POST /api/booking:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
