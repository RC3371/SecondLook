import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { webhookHeadersSchema } from '@/lib/validation/inputValidation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // service role bypasses RLS for admin ops
)

export async function POST(req: Request) {
  const headerPayload = await headers()
  const parsedHeaders = webhookHeadersSchema.safeParse({
    svix_id: headerPayload.get('svix-id'),
    svix_timestamp: headerPayload.get('svix-timestamp'),
    svix_signature: headerPayload.get('svix-signature'),
  })
  if (!parsedHeaders.success) {
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 })
  }

  const { svix_id, svix_timestamp, svix_signature } = parsedHeaders.data

  const body = await req.text()
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!)

  let evt: any
  try {
    evt = wh.verify(body, { 'svix-id': svix_id, 'svix-timestamp': svix_timestamp, 'svix-signature': svix_signature })
  } catch {
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 })
  }

  try {
    if (evt.type === 'organization.created') {
      await supabase.from('organizations').insert({
        clerk_org_id: evt.data.id,
        name: evt.data.name,
      })
    }

    if (evt.type === 'user.created') {
      const org = await supabase
        .from('organizations')
        .select('id')
        .eq('clerk_org_id', evt.data.organization_memberships?.[0]?.organization.id)
        .single()

      if (org.data) {
        await supabase.from('recruiters').insert({
          org_id: org.data.id,
          clerk_user_id: evt.data.id,
          name: `${evt.data.first_name} ${evt.data.last_name}`,
          email: evt.data.email_addresses[0].email_address,
        })
      }
    }
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return new Response('OK', { status: 200 })
}
