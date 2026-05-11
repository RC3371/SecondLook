import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processBatch } from "@/lib/triage/batchTriage";
import { checkRateLimit } from "@/lib/security/rateLimit";
import {
  hasSafeJsonDepth,
  requisitionCriteriaSchema,
  triageRequestSchema,
  type ApplicationStatus,
} from "@/lib/validation/inputValidation";

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Auth
  const { orgId } = await auth();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type must be application/json" },
      { status: 400 }
    );
  }

  const rl = checkRateLimit(`triage:${orgId}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      }
    );
  }

  // 2. Parse + validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!hasSafeJsonDepth(body)) {
    return NextResponse.json(
      { error: "Request JSON is too deeply nested" },
      { status: 400 }
    );
  }

  const parsedBody = triageRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error:
          "Request must include req_id (string) and candidates (non-empty array of { id, resume_text })",
      },
      { status: 400 }
    );
  }

  const { req_id, candidates } = parsedBody.data;

  // 3. Fetch requisition — scoped to the org so orgs can't triage each other's reqs
  let requisition: {
    id: string;
    title: string;
    criteria: ReturnType<typeof requisitionCriteriaSchema.parse>;
  };
  try {
    const supabase = await createClient();
    const { data, error: dbError } = await supabase
      .from("requisitions")
      .select("id, title, criteria")
      .eq("id", req_id)
      .eq("org_id", orgId)
      .single();

    if (dbError || !data) {
      return NextResponse.json(
        { error: "Requisition not found" },
        { status: 404 }
      );
    }

    const parsedCriteria = requisitionCriteriaSchema.safeParse(
      (data as { criteria: unknown }).criteria
    );
    if (!parsedCriteria.success) {
      return NextResponse.json(
        { error: "Requisition criteria is invalid" },
        { status: 500 }
      );
    }

    requisition = {
      id: (data as { id: string }).id,
      title: (data as { title: string }).title,
      criteria: parsedCriteria.data,
    };
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  // 4. Rehydrate candidate records from DB for this requisition only.
  // Never trust client-supplied resume_text/candidate pairing for access control.
  const uniqueCandidateIds = [...new Set(candidates.map((c) => c.id))];
  let authorizedCandidates: Array<{ id: string; resume_text: string }>;
  try {
    const supabase = await createClient();

    // 4a. Fetch candidates scoped to this requisition.
    const { data: rawCandidates, error: candidateError } = await supabase
      .from("candidates")
      .select("id, resume_text")
      .eq("req_id", req_id)
      .in("id", uniqueCandidateIds);

    if (candidateError || !rawCandidates) {
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    // 4b. Filter to only applicants who have given consent.
    // applications.job_posting_id stores the requisition id; applicant_id links to candidates.id.
    const { data: consentedApps, error: consentError } = await supabase
      .from("applications")
      .select("applicant_id")
      .eq("job_posting_id", req_id)
      .eq("status", "consent_given" satisfies ApplicationStatus)
      .in("applicant_id", uniqueCandidateIds);

    if (consentError) {
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    const consentedIds = new Set(
      (consentedApps ?? []).map((a: { applicant_id: string }) => a.applicant_id)
    );
    authorizedCandidates = rawCandidates.filter((c) => consentedIds.has(c.id));

    if (authorizedCandidates.length === 0) {
      return NextResponse.json(
        { error: "No candidates with consent_given status found for this requisition" },
        { status: 422 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  // 5. Run batch triage
  let batchResult;
  try {
    batchResult = await processBatch(
      authorizedCandidates,
      {
        id: requisition.id,
        title: requisition.title,
        criteria: requisition.criteria,
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  // 6. Summarise tier distribution
  const tiers = { top: 0, strong: 0, review: 0, auto_reject: 0 };
  for (const result of batchResult.results) {
    tiers[result.tier]++;
  }

  return NextResponse.json({
    success: true,
    processed: batchResult.processed,
    failed: batchResult.failed,
    tiers,
  });
}
