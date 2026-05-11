import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TriagePage from "./TriagePage";
import type { Application, Req } from "./TriagePage";

const TIER_ORDER = { top: 0, strong: 1, review: 2, auto_reject: 3 } as const;

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { orgId } = await auth();
  if (!orgId) redirect("/sign-in");

  const supabase = await createClient();

  const [{ data: req }, { data: rawApplications }] = await Promise.all([
    supabase
      .from("requisitions")
      .select("id, title, criteria")
      .eq("id", id)
      .eq("org_id", orgId)
      .single(),

    supabase
      .from("applications")
      .select(
        `candidate_id, req_id, org_id, tier, triage_reasoning, status, recruiter_note,
         candidates ( id, name, resume_text )`
      )
      .eq("req_id", id)
      .eq("org_id", orgId),
  ]);

  if (!req) notFound();

  const applications = ((rawApplications ?? []) as unknown as Application[]).sort(
    (a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]
  );

  return (
    <TriagePage req={req as Req} initialApplications={applications} />
  );
}
