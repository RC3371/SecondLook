import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
      <SignIn />
    </div>
  )
}
