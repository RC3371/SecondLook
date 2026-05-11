import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { CreateOrganization } from '@clerk/nextjs'

export default async function OnboardingPage() {
  const { userId } = await auth()

  if (userId) {
    // If this user already has a profile (org already provisioned), skip onboarding
    const supabase = createAdminClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('clerk_user_id', userId)
      .single()

    if (profile) {
      redirect('/index.html')
    }
  }

  return (
    <div className="fixed inset-0 grid place-items-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
      <div className="flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-zinc-50 mb-1">Set up your organization</h1>
          <p className="text-zinc-400 text-sm">Create your team workspace to get started with Second Look.</p>
        </div>
        <CreateOrganization afterCreateOrganizationUrl="/api/post-org-create" />
      </div>
    </div>
  )
}
