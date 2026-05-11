import { CreateOrganization } from '@clerk/nextjs'

export default function OnboardingPage() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
      <div className="flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-zinc-50 mb-1">Set up your organization</h1>
          <p className="text-zinc-400 text-sm">Create your team workspace to get started with Second Look.</p>
        </div>
        <CreateOrganization afterCreateOrganizationUrl="/index.html" />
      </div>
    </div>
  )
}
