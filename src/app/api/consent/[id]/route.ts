import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { consentDecisionSchema, safeIdSchema, type ApplicationStatus } from '@/lib/validation/inputValidation'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!safeIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid application id' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = consentDecisionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'decision must be "given" or "declined"' },
      { status: 400 }
    )
  }

  const { decision } = parsed.data
  const supabase = createAdminClient()

  // Fetch the application to validate state before updating.
  const { data: app, error: fetchError } = await supabase
    .from('applications')
    .select('id, status, consent_expires_at, consent_responded_at')
    .eq('id', id)
    .single()

  if (fetchError || !app) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  if (app.consent_responded_at !== null) {
    return NextResponse.json({ error: 'Consent already recorded' }, { status: 409 })
  }

  if (app.consent_expires_at && new Date(app.consent_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Consent window has expired' }, { status: 410 })
  }

  const newStatus: ApplicationStatus = decision === 'given' ? 'consent_given' : 'consent_declined'

  const { error: updateError } = await supabase
    .from('applications')
    .update({
      status: newStatus,
      consent_responded_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateError) {
    console.error('Consent update error:', updateError)
    return NextResponse.json({ error: 'Failed to record consent' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, status: newStatus })
}
