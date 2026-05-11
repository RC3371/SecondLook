import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import TriagePage from "./TriagePage";
import type { Application, Req } from "./TriagePage";

const TIER_ORDER = { top: 0, strong: 1, review: 2, auto_reject: 3 } as const;

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = createAdminClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("clerk_user_id", userId)
    .single();

  if (!profile) redirect("/sign-in");

  const [{ data: job }, { data: rawApplications }] = await Promise.all([
    supabase
      .from("job_postings")
      .select("id, title, criteria")
      .eq("id", id)
      .eq("org_id", profile.org_id)
      .single(),

    supabase
      .from("applications")
      .select(`
        id,
        applicant_id,
        job_posting_id,
        status,
        ai_tier,
        ai_score,
        ai_reasoning,
        applicants (
          id,
          name,
          resume_text,
          parsed_resume
        )
      `)
      .eq("job_posting_id", id),
  ]);

  if (!job) notFound();

  const applications = ((rawApplications ?? []) as unknown as Application[]).sort(
    (a, b) => {
      const ta = a.ai_tier ? TIER_ORDER[a.ai_tier] : 99;
      const tb = b.ai_tier ? TIER_ORDER[b.ai_tier] : 99;
      return ta - tb;
    }
  );

  return (
    <TriagePage req={job as Req} initialApplications={applications} />
  );
}
