import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RiskSignals } from "../resumeParser";
import type { TriageResult } from "../geminiTriage";

vi.mock("../preFilter", () => ({ preFilterCandidate: vi.fn() }));
vi.mock("../resumeParser", () => ({ parseResume: vi.fn() }));
vi.mock("../geminiTriage", () => ({ triageCandidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { preFilterCandidate } from "../preFilter";
import { parseResume } from "../resumeParser";
import { triageCandidate } from "../geminiTriage";
import { createClient } from "@/lib/supabase/server";
import { processBatch } from "../batchTriage";

// ── Typed mock references ──────────────────────────────────────────────────────

const mockPreFilter = vi.mocked(preFilterCandidate);
const mockParseResume = vi.mocked(parseResume);
const mockTriageCandidate = vi.mocked(triageCandidate);
const mockCreateClient = vi.mocked(createClient);

// ── Fixtures ───────────────────────────────────────────────────────────────────

const RISKS: RiskSignals = {
  keyword_stuffing: false,
  possible_ai_generated: false,
  prompt_injection: false,
  suspiciously_short: false,
};

const PARSED_RESUME = {
  years_of_experience: 5,
  most_recent_title: "Software Engineer",
  most_recent_company: "Acme Corp",
  education: { degree: "B.S.", field: "Computer Science", institution: "MIT" },
  skills: ["Python", "TypeScript"],
  employment_gaps: false,
  total_jobs: 3,
  avg_tenure_months: 24,
  raw_text: "software engineer python typescript five years experience",
};

const TRIAGE_RESULT: TriageResult = {
  tier: "strong",
  matched: ["5+ years experience", "TypeScript"],
  missing: [],
  preferred_hits: ["Python"],
  confidence: 0.9,
  summary: "Strong candidate, meets all requirements",
};

const REQ = {
  id: "req-1",
  title: "Senior Software Engineer",
  criteria: {
    required: { min_years_experience: 3, seniority: "senior" as const },
    preferred: ["Python"],
    dealbreakers: [],
  },
};

function makeCandidate(id: string) {
  return { id, resume_text: `resume text for candidate ${id}` };
}

function makeCandidates(count: number) {
  return Array.from({ length: count }, (_, i) => makeCandidate(`c${i}`));
}

// ── Shared mock state (reassigned each beforeEach) ────────────────────────────

let mockUpsert: ReturnType<typeof vi.fn>;
let mockFrom: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();

  mockUpsert = vi.fn().mockResolvedValue({ error: null });
  mockFrom = vi.fn().mockReturnValue({ upsert: mockUpsert });
  mockCreateClient.mockResolvedValue({ from: mockFrom } as never);

  mockPreFilter.mockReturnValue({ passed: true, confidence: 1 });
  mockParseResume.mockReturnValue({ parsed: PARSED_RESUME, risks: RISKS });
  mockTriageCandidate.mockResolvedValue(TRIAGE_RESULT);
});

// ── Pipeline flow ──────────────────────────────────────────────────────────────

describe("pipeline flow", () => {
  it("calls parseResume and triageCandidate when candidate passes pre-filter", async () => {
    await processBatch([makeCandidate("c1")], REQ, "org-1");

    expect(mockParseResume).toHaveBeenCalledOnce();
    expect(mockParseResume).toHaveBeenCalledWith("resume text for candidate c1");
    expect(mockTriageCandidate).toHaveBeenCalledOnce();
  });

  it("auto-rejects without calling triageCandidate when pre-filter confidence >= 0.7", async () => {
    mockPreFilter.mockReturnValue({
      passed: false,
      confidence: 0.8,
      rejectionReason: "Only 1 year experience; role requires 5+",
    });

    const batch = await processBatch([makeCandidate("c1")], REQ, "org-1");

    expect(mockTriageCandidate).not.toHaveBeenCalled();
    expect(batch.results[0].tier).toBe("auto_reject");
  });

  it("calls triageCandidate when pre-filter fails with confidence < 0.7 (uncertain rejection)", async () => {
    mockPreFilter.mockReturnValue({
      passed: false,
      confidence: 0.5,
      rejectionReason: "Weak signal — degree not found",
    });

    await processBatch([makeCandidate("c1")], REQ, "org-1");

    expect(mockTriageCandidate).toHaveBeenCalledOnce();
  });
});

// ── Batch behavior ─────────────────────────────────────────────────────────────

describe("batch behavior", () => {
  it("processes 25 candidates in exactly 3 batches (Promise.allSettled called 3 times)", async () => {
    const allSettledSpy = vi.spyOn(Promise, "allSettled");

    await processBatch(makeCandidates(25), REQ, "org-1");

    expect(allSettledSpy).toHaveBeenCalledTimes(3);
    allSettledSpy.mockRestore();
  }, 10_000);

  it("completes all 9 remaining candidates when one rejects mid-batch (Promise.allSettled isolation)", async () => {
    mockUpsert.mockImplementation((record: { candidate_id: string }) =>
      record.candidate_id === "c4"
        ? Promise.resolve({ error: { message: "simulated DB failure" } })
        : Promise.resolve({ error: null })
    );

    const batch = await processBatch(makeCandidates(10), REQ, "org-1");

    expect(batch.processed).toBe(9);
    expect(batch.failed).toBe(1);
  });

  it("increments failed correctly for each erroring candidate", async () => {
    mockUpsert.mockImplementation((record: { candidate_id: string }) =>
      record.candidate_id === "c2"
        ? Promise.resolve({ error: { message: "constraint violation" } })
        : Promise.resolve({ error: null })
    );

    const batch = await processBatch(makeCandidates(5), REQ, "org-1");

    expect(batch.failed).toBe(1);
  });

  it("increments processed correctly for all successful candidates", async () => {
    const batch = await processBatch(makeCandidates(5), REQ, "org-1");

    expect(batch.processed).toBe(5);
    expect(batch.failed).toBe(0);
    expect(batch.results).toHaveLength(5);
  });
});

// ── Supabase writes ────────────────────────────────────────────────────────────

describe("Supabase writes", () => {
  it("upserts every processed candidate to the applications table", async () => {
    await processBatch([makeCandidate("c1"), makeCandidate("c2")], REQ, "org-1");

    expect(mockFrom).toHaveBeenCalledWith("applications");
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });

  it("upserted record contains org_id, candidate_id, req_id, tier, and triage_reasoning", async () => {
    await processBatch([makeCandidate("c1")], REQ, "org-1");

    const [record, options] = mockUpsert.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];

    expect(record).toMatchObject({
      org_id: "org-1",
      candidate_id: "c1",
      req_id: REQ.id,
      tier: TRIAGE_RESULT.tier,
      triage_reasoning: expect.objectContaining({
        matched: TRIAGE_RESULT.matched,
        missing: TRIAGE_RESULT.missing,
        preferred_hits: TRIAGE_RESULT.preferred_hits,
        confidence: TRIAGE_RESULT.confidence,
        summary: TRIAGE_RESULT.summary,
      }),
    });
    expect(options).toEqual({ onConflict: "candidate_id,req_id" });
  });

  it("does not include failed candidates in results (no partial records)", async () => {
    mockUpsert.mockImplementation((record: { candidate_id: string }) =>
      record.candidate_id === "c1"
        ? Promise.resolve({ error: { message: "write failed" } })
        : Promise.resolve({ error: null })
    );

    const batch = await processBatch(
      [makeCandidate("c1"), makeCandidate("c2")],
      REQ,
      "org-1"
    );

    expect(batch.failed).toBe(1);
    expect(batch.results).toHaveLength(1);
    expect(batch.results[0].candidate_id).toBe("c2");
  });
});

// ── Data integrity ─────────────────────────────────────────────────────────────

describe("data integrity", () => {
  it("triage_reasoning in upserted record matches exactly what triageCandidate returned", async () => {
    await processBatch([makeCandidate("c1")], REQ, "org-1");

    const [record] = mockUpsert.mock.calls[0] as [{ triage_reasoning: Record<string, unknown> }];
    const { triage_reasoning } = record;

    expect(triage_reasoning.matched).toEqual(TRIAGE_RESULT.matched);
    expect(triage_reasoning.missing).toEqual(TRIAGE_RESULT.missing);
    expect(triage_reasoning.preferred_hits).toEqual(TRIAGE_RESULT.preferred_hits);
    expect(triage_reasoning.confidence).toBe(TRIAGE_RESULT.confidence);
    expect(triage_reasoning.summary).toBe(TRIAGE_RESULT.summary);
  });

  it("includes pre_filter_reason in triage_reasoning when pre-filter rejected the candidate", async () => {
    const rejectionReason = "Resume shows 1 year; role requires 5+ years experience";

    mockPreFilter.mockReturnValue({
      passed: false,
      confidence: 0.85,
      rejectionReason,
    });

    await processBatch([makeCandidate("c1")], REQ, "org-1");

    const [record] = mockUpsert.mock.calls[0] as [{ triage_reasoning: Record<string, unknown> }];
    expect(record.triage_reasoning.pre_filter_reason).toBe(rejectionReason);
  });
});
