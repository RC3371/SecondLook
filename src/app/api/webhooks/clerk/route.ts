import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // service role bypasses RLS for admin ops
)

export async function POST(req: Request) {
  const headerPayload = await headers()
  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  const body = await req.text()
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!)

  let evt: any
  try {
    evt = wh.verify(body, { 'svix-id': svix_id!, 'svix-timestamp': svix_timestamp!, 'svix-signature': svix_signature! })
  } catch {
    return new Response('Invalid webhook', { status: 400 })
  }

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

  return new Response('OK', { status: 200 })
}