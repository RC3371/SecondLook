'use client'

import { useClerk } from '@clerk/nextjs'
import { useEffect } from 'react'

export default function SignOutPage() {
  const { signOut } = useClerk()

  useEffect(() => {
    signOut({ redirectUrl: '/sign-in' })
  }, [signOut])

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-400 text-sm">
      Signing out…
    </div>
  )
}
