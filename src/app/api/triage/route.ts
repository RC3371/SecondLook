import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processBatch } from "@/lib/triage/batchTriage";

// ── Request shape ─────────────────────────────────────────────────────────────

interface TriageRequestBody {
  req_id: string;
  candidates: Array<{ id: string; resume_text: string }>;
}

function isValidBody(body: unknown): body is TriageRequestBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.req_id === "string" &&
    b.req_id.trim().length > 0 &&
    Array.isArray(b.candidates) &&
    b.candidates.length > 0 &&
    b.candidates.every(
      (c) =>
        c &&
        typeof c === "object" &&
        typeof (c as Record<string, unknown>).id === "string" &&
        typeof (c as Record<string, unknown>).resume_text === "string"
    )
  );
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Auth
  const { orgId } = await auth();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse + validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidBody(body)) {
    return NextResponse.json(
      {
        error:
          "Request must include req_id (string) and candidates (non-empty array of { id, resume_text })",
      },
      { status: 400 }
    );
  }

  const { req_id, candidates } = body;

  // 3. Fetch requisition — scoped to the org so orgs can't triage each other's reqs
  const supabase = await createClient();
  const { data: requisition, error: dbError } = await supabase
    .from("requisitions")
    .select("id, title, criteria")
    .eq("id", req_id)
    .eq("org_id", orgId)
    .single();

  if (dbError || !requisition) {
    return NextResponse.json(
      { error: "Requisition not found" },
      { status: 404 }
    );
  }

  // 4. Run batch triage
  let batchResult;
  try {
    batchResult = await processBatch(
      candidates,
      {
        id: requisition.id as string,
        title: requisition.title as string,
        criteria: requisition.criteria as object,
      },
      orgId
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Triage failed: ${message}` },
      { status: 500 }
    );
  }

  // 5. Summarise tier distribution
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
