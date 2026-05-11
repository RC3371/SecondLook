import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const user = await currentUser()
  return NextResponse.json({
    id: userId,
    firstName: user?.firstName ?? null,
    lastName: user?.lastName ?? null,
    fullName: user?.fullName ?? user?.emailAddresses[0]?.emailAddress ?? 'Unknown',
    email: user?.emailAddresses[0]?.emailAddress ?? null,
    imageUrl: user?.imageUrl ?? null,
  })
}
