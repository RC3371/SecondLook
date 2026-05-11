import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
      <SignUp />
    </div>
  )
}
