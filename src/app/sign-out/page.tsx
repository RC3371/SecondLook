'use client'

import { useClerk } from '@clerk/nextjs'
import { useEffect } from 'react'

export default function SignOutPage() {
  const { signOut } = useClerk()

  useEffect(() => {
    signOut({ redirectUrl: '/sign-in' })
  }, [signOut])

  return (
    <div className="fixed inset-0 grid place-items-center bg-zinc-950">
      <p className="text-zinc-400 text-sm">Signing out…</p>
    </div>
  )
}
