import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const headerPayload = await headers()
  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  const body = await req.text()
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!)

  let evt: any
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id!,
      'svix-timestamp': svix_timestamp!,
      'svix-signature': svix_signature!,
    })
  } catch {
    return new Response('Invalid webhook', { status: 400 })
  }

  const supabase = createAdminClient()

  if (evt.type === 'organization.created') {
    await supabase.from('organizations').insert({
      clerk_org_id: evt.data.id,
      name: evt.data.name,
    })
  }

  if (evt.type === 'organizationMembership.created') {
    const clerkUserId = evt.data.public_user_data.user_id
    const clerkOrgId = evt.data.organization.id
    const email = evt.data.public_user_data.identifier
    const fullName = [evt.data.public_user_data.first_name, evt.data.public_user_data.last_name]
      .filter(Boolean).join(' ')

    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('clerk_org_id', clerkOrgId)
      .single()

    if (org) {
      await supabase.from('profiles').upsert({
        id: crypto.randomUUID(),
        clerk_user_id: clerkUserId,
        org_id: org.id,
        email,
        full_name: fullName,
        role: evt.data.role === 'org:admin' ? 'admin' : 'recruiter',
      }, { onConflict: 'clerk_user_id' })
    }
  }

  return new Response('OK', { status: 200 })
}
