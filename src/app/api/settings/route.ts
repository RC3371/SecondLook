import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const { auth } = await import('@clerk/nextjs/server')
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('user_settings')
      .select('settings')
      .eq('user_id', userId)
      .single()

    if (error || !data) {
      return NextResponse.json({ fullName: '', email: '', notifications: { newReferralMatch: true, dailyDigest: true } })
    }
    return NextResponse.json(data.settings)
  } catch (err) {
    console.error('Error in GET /api/settings:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const { auth } = await import('@clerk/nextjs/server')
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const supabase = createAdminClient()

    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: userId, settings: body }, { onConflict: 'user_id' })

    if (error) {
      console.error('Supabase error saving settings:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error in PUT /api/settings:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
