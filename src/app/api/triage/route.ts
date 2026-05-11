import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processBatch } from "@/lib/triage/batchTriage";
import { checkRateLimit } from "@/lib/security/rateLimit";
import {
  jobTriageRequestSchema,
  type ApplicationStatus,
} from "@/lib/validation/inputValidation";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // up to 5 min for large batches

export async function POST(req: NextRequest) {
  // ── 1. Auth ─────────────────────────────────────────────────────────────────
  // Accept either a Clerk session (browser "Run Triage" button) or a
  // TRIAGE_SECRET bearer token (server-to-server call from the import route).
  const authHeader = req.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const isServerCall =
    bearerToken != null &&
    process.env.TRIAGE_SECRET != null &&
    bearerToken === process.env.TRIAGE_SECRET;

  let clerkUserId: string | null = null;
  let orgId: string | null = null;
  if (!isServerCall) {
    const { userId, orgId: clerkOrgId } = await auth();
    if (!userId || !clerkOrgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    clerkUserId = userId;
    orgId = clerkOrgId;
  }

  // ── 2. Rate limit ────────────────────────────────────────────────────────────
  const rlKey = orgId ?? `server:${bearerToken?.slice(-8)}`;
  const rl = checkRateLimit(`triage:${rlKey}`, { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  // ── 3. Parse body ────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = jobTriageRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "job_posting_id is required" },
      { status: 400 }
    );
  }

  const { job_posting_id } = parsedBody.data;
  const supabase = createAdminClient();

  // ── 4. Fetch and verify the job posting ──────────────────────────────────────
  let jobQuery = supabase
    .from("job_postings")
    .select("id, title, criteria")
    .eq("id", job_posting_id);

  // Scope to the authenticated org when called from the browser.
  // Server-to-server calls trust the job_posting_id from the import route.
  // Use profiles.org_id (same path as import/jobs routes) to avoid clerk_org_id mismatch.
  if (clerkUserId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("clerk_user_id", clerkUserId)
      .single();
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }
    jobQuery = jobQuery.eq("org_id", profile.org_id) as typeof jobQuery;
  }

  const { data: job, error: jobError } = await jobQuery.single();
  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // ── 5. Fetch pending applicants for this job ─────────────────────────────────
  // Include both pending_consent (consent email not yet wired) and consent_given.
  // Skip applicants already triaged (ai_tier IS NOT NULL).
  const { data: pendingRows, error: appsError } = await supabase
    .from("applications")
    .select("applicant_id, applicants!inner(id, resume_text)")
    .eq("job_posting_id", job_posting_id)
    .in("status", ["pending_consent", "consent_given"] satisfies ApplicationStatus[])
    .is("ai_tier", null);

  if (appsError) {
    console.error("[triage] Failed to fetch pending applications:", appsError);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  const candidates = (pendingRows ?? [])
    .map((row: any) => ({
      id: row.applicant_id as string,
      resume_text: (row.applicants?.resume_text ?? "") as string,
    }))
    .filter((c) => c.resume_text.trim().length > 0);

  if (candidates.length === 0) {
    console.log(`[triage] No pending applicants to triage for job ${job_posting_id}`);
    return NextResponse.json({ success: true, processed: 0, failed: 0 });
  }

  console.log(
    `[triage] Starting triage for ${candidates.length} applications — job: ${job_posting_id}`
  );

  // ── 6. Normalise criteria ────────────────────────────────────────────────────
  // job_postings.criteria may be sparse (e.g. just { department }).
  // Provide safe defaults so preFilter and Gemini always get a valid shape.
  const raw = (job.criteria as Record<string, any>) ?? {};
  const criteria = {
    required: {
      min_years_experience: raw.required?.min_years_experience ?? 0,
      seniority: raw.required?.seniority ?? "junior",
      skills: raw.required?.skills ?? [],
      ...(raw.required ?? {}),
    },
    preferred: raw.preferred ?? [],
    dealbreakers: raw.dealbreakers ?? [],
    ...raw,
  };

  // ── 7. Run batch triage ──────────────────────────────────────────────────────
  let batchResult;
  try {
    batchResult = await processBatch(candidates, {
      id: job_posting_id,
      title: (job as any).title,
      criteria,
    });
  } catch (err) {
    console.error("[triage] processBatch threw:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  console.log(
    `[triage] Complete — processed: ${batchResult.processed}, failed: ${batchResult.failed}`
  );

  const tierCounts = batchResult.results.reduce(
    (acc, r) => ({ ...acc, [r.tier]: (acc[r.tier] ?? 0) + 1 }),
    {} as Record<string, number>
  );

  return NextResponse.json({
    success: true,
    processed: batchResult.processed,
    failed: batchResult.failed,
    tiers: tierCounts,
  });
}
