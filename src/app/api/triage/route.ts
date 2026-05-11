import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processBatch } from "@/lib/triage/batchTriage";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { jobTriageRequestSchema } from "@/lib/validation/inputValidation";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // up to 5 min for large batches

const TRIAGEABLE_STATUSES = new Set([
  "pending_consent",
  "consent_given",
  "triaged",
]);

const SKIP_REASON_BY_STATUS: Record<string, string> = {
  consent_declined: "consent declined",
  referred: "already referred",
  rejected: "already rejected",
};

interface ApplicationRow {
  applicant_id: string;
  status: string | null;
  applicants:
    | {
        id: string;
        resume_text: string | null;
      }
    | {
        id: string;
        resume_text: string | null;
      }[]
    | null;
}

interface RawCriteria {
  required?: {
    min_years_experience?: number;
    seniority?: string;
    skills?: string[];
  } & Record<string, unknown>;
  preferred?: unknown;
  dealbreakers?: unknown;
  [key: string]: unknown;
}

function formatStatusCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) return "";
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => {
      const reason = SKIP_REASON_BY_STATUS[status] ?? "unsupported status";
      return `${count} ${status} (${reason})`;
    })
    .join(", ");
}

function extractResumeText(row: ApplicationRow): string {
  if (Array.isArray(row.applicants)) {
    return row.applicants[0]?.resume_text ?? "";
  }
  return row.applicants?.resume_text ?? "";
}

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

  // ── 5. Fetch applicants for this job and decide who is eligible ─────────────
  const { data: rawRows, error: appsError } = await supabase
    .from("applications")
    .select("applicant_id, status, applicants!inner(id, resume_text)")
    .eq("job_posting_id", job_posting_id);

  if (appsError) {
    console.error("[triage] Failed to fetch applications:", appsError);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  const rows = (rawRows ?? []) as ApplicationRow[];
  const skippedByStatus: Record<string, number> = {};
  const eligibleRows = rows.filter((row) => {
    const status = row.status ?? "unknown";
    if (TRIAGEABLE_STATUSES.has(status)) return true;
    skippedByStatus[status] = (skippedByStatus[status] ?? 0) + 1;
    return false;
  });

  const candidates = eligibleRows.map((row) => ({
    id: row.applicant_id as string,
    resume_text: extractResumeText(row),
  }));

  const emptyResumeCount = candidates.filter((c) => !c.resume_text.trim()).length;
  if (emptyResumeCount > 0) {
    console.warn(
      `[triage] ${emptyResumeCount}/${candidates.length} applicants have no resume_text — they will receive a low-signal AI result`
    );
  }

  const skippedCandidates = rows.length - candidates.length;
  if (skippedCandidates > 0) {
    console.warn(
      `[triage] Skipping ${skippedCandidates}/${rows.length} applications due to status: ${formatStatusCounts(skippedByStatus)}`
    );
  }

  if (candidates.length === 0) {
    const message = skippedCandidates > 0
      ? `No triageable candidates found. Skipped ${skippedCandidates}: ${formatStatusCounts(skippedByStatus)}.`
      : "No candidates found for this job.";
    console.log(`[triage] ${message} job=${job_posting_id}`);
    return NextResponse.json({
      success: true,
      processed: 0,
      failed: 0,
      total_applications: rows.length,
      eligible_candidates: 0,
      skipped_candidates: skippedCandidates,
      skipped_by_status: skippedByStatus,
      message,
    });
  }

  console.log(
    `[triage] Starting triage for ${candidates.length}/${rows.length} applications — job: ${job_posting_id}`
  );

  // ── 6. Normalise criteria ────────────────────────────────────────────────────
  // job_postings.criteria may be sparse (e.g. just { department }).
  // Provide safe defaults so preFilter and Gemini always get a valid shape.
  const raw = (job.criteria ?? {}) as RawCriteria;
  const required = (raw.required ?? {}) as Record<string, unknown>;
  const preferred = Array.isArray(raw.preferred) ? raw.preferred : [];
  const dealbreakers = Array.isArray(raw.dealbreakers) ? raw.dealbreakers : [];
  const jobTitle = typeof job.title === "string" ? job.title : "Untitled role";
  const criteria = {
    required: {
      min_years_experience:
        typeof required.min_years_experience === "number"
          ? required.min_years_experience
          : 0,
      seniority:
        typeof required.seniority === "string" ? required.seniority : "junior",
      skills: Array.isArray(required.skills) ? required.skills : [],
      ...required,
    },
    preferred,
    dealbreakers,
    ...raw,
  };

  // ── 7. Run batch triage ──────────────────────────────────────────────────────
  let batchResult;
  try {
    batchResult = await processBatch(candidates, {
      id: job_posting_id,
      title: jobTitle,
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

  const messageParts = [
    `Triaged ${batchResult.processed}/${rows.length} candidates.`,
  ];
  if (skippedCandidates > 0) {
    messageParts.push(
      `Skipped ${skippedCandidates}: ${formatStatusCounts(skippedByStatus)}.`
    );
  }
  if (batchResult.failed > 0) {
    messageParts.push(`${batchResult.failed} failed during processing.`);
  }

  return NextResponse.json({
    success: true,
    processed: batchResult.processed,
    failed: batchResult.failed,
    tiers: tierCounts,
    total_applications: rows.length,
    eligible_candidates: candidates.length,
    skipped_candidates: skippedCandidates,
    skipped_by_status: skippedByStatus,
    message: messageParts.join(" "),
  });
}
