import { ensureProfile } from '@/lib/ensure-profile'
import { NextResponse } from 'next/server'

/**
 * Landing point after CreateOrganization completes.
 * Forces profile provisioning synchronously before sending the user
 * to the dashboard, so the dashboard never hits a missing-profile 403.
 */
export async function GET(req: Request) {
  await ensureProfile()
  return NextResponse.redirect(new URL('/index.html', req.url))
}
