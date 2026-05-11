import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { preFilterCandidate, type RequisitionCriteria } from "./preFilter";
import { parseResume, type RiskSignals } from "./resumeParser";
import { triageCandidate } from "./geminiTriage";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Candidate {
  id: string;
  resume_text: string;
}

interface Req {
  id: string;
  title: string;
  criteria: object;
}

interface TriageReasoning {
  matched: string[];
  missing: string[];
  preferred_hits: string[];
  risk_flags: RiskSignals;
  pre_filter_reason?: string;
  confidence: number;
  summary: string;
}

export interface ApplicationResult {
  candidate_id: string;
  req_id: string;
  org_id: string;
  tier: "auto_reject" | "review" | "strong" | "top";
  triage_reasoning: TriageReasoning;
  status: "pending";
}

export interface BatchResult {
  processed: number;
  failed: number;
  results: ApplicationResult[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 100;

const DEFAULT_RISK_FLAGS: RiskSignals = {
  keyword_stuffing: false,
  possible_ai_generated: false,
  prompt_injection: false,
  suspiciously_short: false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Per-candidate pipeline ────────────────────────────────────────────────────

async function processOne(
  candidate: Candidate,
  req: Req,
  orgId: string
): Promise<ApplicationResult> {
  // Step 1: Pre-filter (pure, fast — runs before any AI call)
  const preFilter = preFilterCandidate(
    candidate.resume_text,
    req.criteria as RequisitionCriteria
  );

  // Step 2: Parse resume (pure — always run so risk_flags are available even
  // for pre-filtered rejects, and so the cache key for Gemini is consistent)
  const { parsed, risks } = parseResume(candidate.resume_text);

  // Step 3: Skip Gemini if pre-filter is confident enough in the rejection
  if (!preFilter.passed && preFilter.confidence >= 0.7) {
    return {
      candidate_id: candidate.id,
      req_id: req.id,
      org_id: orgId,
      tier: "auto_reject",
      triage_reasoning: {
        matched: [],
        missing: [],
        preferred_hits: [],
        risk_flags: risks,
        pre_filter_reason: preFilter.rejectionReason,
        confidence: preFilter.confidence,
        summary:
          preFilter.rejectionReason ??
          "Pre-filter: candidate does not meet minimum requirements",
      },
      status: "pending",
    };
  }

  // Step 4: AI triage
  const triage = await triageCandidate(parsed, req.criteria, req.title);

  return {
    candidate_id: candidate.id,
    req_id: req.id,
    org_id: orgId,
    tier: triage.tier,
    triage_reasoning: {
      matched: triage.matched,
      missing: triage.missing,
      preferred_hits: triage.preferred_hits,
      risk_flags: risks,
      confidence: triage.confidence,
      summary: triage.summary,
    },
    status: "pending",
  };
}

// ── Supabase write ────────────────────────────────────────────────────────────

async function upsertResult(
  supabase: SupabaseClient,
  result: ApplicationResult
): Promise<void> {
  const { error } = await supabase
    .from("applications")
    .upsert(result, { onConflict: "candidate_id,req_id" });

  if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
}

// ── Batch orchestrator ────────────────────────────────────────────────────────

export async function processBatch(
  candidates: Candidate[],
  req: Req,
  orgId: string
): Promise<BatchResult> {
  // createClient() calls cookies() — must be invoked within a Next.js request
  // context (API route, Server Action). Call once here, not per-candidate.
  const supabase = await createClient();

  const batches = chunk(candidates, BATCH_SIZE);
  const results: ApplicationResult[] = [];
  let failed = 0;

  for (let i = 0; i < batches.length; i++) {
    if (i > 0) await delay(BATCH_DELAY_MS);

    const settled = await Promise.allSettled(
      batches[i].map(async (candidate) => {
        let result: ApplicationResult;

        try {
          result = await processOne(candidate, req, orgId);
        } catch {
          // Pipeline failure — build a safe fallback record so the candidate
          // isn't silently dropped; a human still sees it for review.
          result = {
            candidate_id: candidate.id,
            req_id: req.id,
            org_id: orgId,
            tier: "review",
            triage_reasoning: {
              matched: [],
              missing: [],
              preferred_hits: [],
              risk_flags: DEFAULT_RISK_FLAGS,
              confidence: 0,
              summary: "Processing error — please review manually",
            },
            status: "pending",
          };
        }

        // Upsert is kept separate from processOne so a DB failure is still
        // counted as a batch failure even when the pipeline itself succeeded.
        await upsertResult(supabase, result);
        return result;
      })
    );

    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        results.push(outcome.value);
      } else {
        failed++;
      }
    }
  }

  return { processed: results.length, failed, results };
}
