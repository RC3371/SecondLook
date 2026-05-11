import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/triage/batchTriage", () => ({ processBatch: vi.fn() }));

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { processBatch } from "@/lib/triage/batchTriage";
import { POST } from "../route";

// ── Typed mock references ──────────────────────────────────────────────────────

const mockAuth = vi.mocked(auth);
const mockCreateClient = vi.mocked(createClient);
const mockProcessBatch = vi.mocked(processBatch);

// ── Fixtures ───────────────────────────────────────────────────────────────────

const REQUISITION = {
  id: "req-1",
  title: "Senior Software Engineer",
  criteria: {
    required: {
      min_years_experience: 3,
      seniority: "senior",
      skills: ["Python"],
    },
    preferred: ["Python"],
    dealbreakers: [],
  },
};

const CANDIDATES = [
  { id: "cand-1", resume_text: "5 years Python, strong distributed systems background" },
  { id: "cand-2", resume_text: "3 years JavaScript, junior developer looking to grow" },
];

const BATCH_RESULT = {
  processed: 2,
  failed: 0,
  results: [
    {
      candidate_id: "cand-1",
      req_id: "req-1",
      org_id: "org-1",
      tier: "strong" as const,
      triage_reasoning: {
        matched: ["5+ years"],
        missing: [],
        preferred_hits: ["Python"],
        risk_flags: {},
        confidence: 0.9,
        summary: "Solid candidate",
      },
      status: "pending" as const,
    },
    {
      candidate_id: "cand-2",
      req_id: "req-1",
      org_id: "org-1",
      tier: "review" as const,
      triage_reasoning: {
        matched: [],
        missing: ["5+ years"],
        preferred_hits: [],
        risk_flags: {},
        confidence: 0.6,
        summary: "Needs review",
      },
      status: "pending" as const,
    },
  ],
};

// ── Helper ─────────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/triage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Supabase chain mock state (reassigned each beforeEach) ────────────────────

let mockSingle: ReturnType<typeof vi.fn>;
let mockReqChainable: {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
};
let mockCandidatesIn: ReturnType<typeof vi.fn>;
let mockCandidatesEq: ReturnType<typeof vi.fn>;
let mockCandidatesChainable: {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
};
let mockFrom: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();

  mockSingle = vi.fn().mockResolvedValue({ data: REQUISITION, error: null });
  mockReqChainable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: mockSingle,
  };

  mockCandidatesIn = vi
    .fn()
    .mockResolvedValue({ data: CANDIDATES, error: null });
  mockCandidatesEq = vi.fn().mockReturnValue({ in: mockCandidatesIn });
  mockCandidatesChainable = {
    select: vi.fn().mockReturnValue({ eq: mockCandidatesEq }),
    eq: mockCandidatesEq,
    in: mockCandidatesIn,
  };

  mockFrom = vi.fn((table: string) => {
    if (table === "requisitions") return mockReqChainable;
    if (table === "candidates") return mockCandidatesChainable;
    return mockReqChainable;
  });
  mockCreateClient.mockResolvedValue({ from: mockFrom } as never);

  mockAuth.mockResolvedValue({ orgId: "org-1" } as never);
  mockProcessBatch.mockResolvedValue(BATCH_RESULT as never);
});

// ── Authentication ─────────────────────────────────────────────────────────────

describe("authentication", () => {
  it("returns 401 when there is no Clerk session", async () => {
    mockAuth.mockResolvedValue({ orgId: undefined } as never);

    const res = await POST(makeRequest({ req_id: "req-1", candidates: CANDIDATES }));

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "Unauthorized" });
  });

  it("returns 401 when a session exists but has no orgId", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1", orgId: null } as never);

    const res = await POST(makeRequest({ req_id: "req-1", candidates: CANDIDATES }));

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "Unauthorized" });
  });

  it("proceeds past auth when a valid orgId is present", async () => {
    const res = await POST(makeRequest({ req_id: "req-1", candidates: CANDIDATES }));

    expect(res.status).toBe(200);
    expect(mockProcessBatch).toHaveBeenCalledOnce();
  });
});

// ── Request validation ─────────────────────────────────────────────────────────

describe("request validation", () => {
  it("returns 400 when req_id is missing from the body", async () => {
    const res = await POST(makeRequest({ candidates: CANDIDATES }));

    expect(res.status).toBe(400);
  });

  it("returns 400 when candidates array is missing from the body", async () => {
    const res = await POST(makeRequest({ req_id: "req-1" }));

    expect(res.status).toBe(400);
  });

  it("returns 400 with a helpful message when candidates is an empty array", async () => {
    const res = await POST(makeRequest({ req_id: "req-1", candidates: [] }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/candidates/i);
  });

  it("returns 400 when a candidate is missing resume_text", async () => {
    const res = await POST(
      makeRequest({ req_id: "req-1", candidates: [{ id: "c1" }] })
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 when a candidate is missing id", async () => {
    const res = await POST(
      makeRequest({
        req_id: "req-1",
        candidates: [{ resume_text: "some resume content" }],
      })
    );

    expect(res.status).toBe(400);
  });
});

// ── Requisition lookup ─────────────────────────────────────────────────────────

describe("requisition lookup", () => {
  it("returns 404 when req_id is not found in Supabase", async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: "No rows returned" },
    });

    const res = await POST(
      makeRequest({ req_id: "nonexistent-req", candidates: CANDIDATES })
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Requisition not found" });
  });

  it("returns 404 when req_id belongs to a different org (org isolation via .eq)", async () => {
    mockSingle.mockResolvedValue({ data: null, error: null });

    const res = await POST(
      makeRequest({ req_id: "req-other-org", candidates: CANDIDATES })
    );

    expect(res.status).toBe(404);
    expect(mockReqChainable.eq).toHaveBeenCalledWith("org_id", "org-1");
  });

  it("proceeds to processBatch when req_id is found and belongs to the correct org", async () => {
    const res = await POST(makeRequest({ req_id: "req-1", candidates: CANDIDATES }));

    expect(res.status).toBe(200);
    expect(mockProcessBatch).toHaveBeenCalledOnce();
    expect(mockProcessBatch).toHaveBeenCalledWith(
      CANDIDATES,
      expect.objectContaining({ id: REQUISITION.id, title: REQUISITION.title }),
      "org-1"
    );
  });

  it("returns 404 when any candidate id is not scoped to the requisition", async () => {
    mockCandidatesIn.mockResolvedValueOnce({
      data: [{ id: "cand-1", resume_text: "5 years Python..." }],
      error: null,
    });

    const res = await POST(
      makeRequest({ req_id: "req-1", candidates: CANDIDATES })
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      error: "One or more candidates not found for this requisition",
    });
    expect(mockProcessBatch).not.toHaveBeenCalled();
  });
});

// ── Successful response ────────────────────────────────────────────────────────

describe("successful response", () => {
  it("returns 200 with success, processed, failed, and tiers fields", async () => {
    const res = await POST(makeRequest({ req_id: "req-1", candidates: CANDIDATES }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      processed: BATCH_RESULT.processed,
      failed: BATCH_RESULT.failed,
      tiers: expect.objectContaining({
        top: expect.any(Number),
        strong: expect.any(Number),
        review: expect.any(Number),
        auto_reject: expect.any(Number),
      }),
    });
  });

  it("counts tiers correctly from BatchResult results", async () => {
    const baseResult = BATCH_RESULT.results[0];
    mockProcessBatch.mockResolvedValue({
      processed: 5,
      failed: 1,
      results: [
        { ...baseResult, tier: "top" as const },
        { ...baseResult, tier: "top" as const },
        { ...baseResult, tier: "strong" as const },
        { ...baseResult, tier: "review" as const },
        { ...baseResult, tier: "auto_reject" as const },
      ],
    } as never);

    const res = await POST(makeRequest({ req_id: "req-1", candidates: CANDIDATES }));
    const body = await res.json();

    expect(body.tiers).toEqual({ top: 2, strong: 1, review: 1, auto_reject: 1 });
    expect(body.processed).toBe(5);
    expect(body.failed).toBe(1);
  });
});

// ── Error handling ─────────────────────────────────────────────────────────────

describe("error handling", () => {
  it("returns 500 with generic error when processBatch throws (no stack trace leaked)", async () => {
    mockProcessBatch.mockRejectedValue(
      new Error("Gemini rate limit exceeded — internal detail")
    );

    const res = await POST(makeRequest({ req_id: "req-1", candidates: CANDIDATES }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Internal server error");
    expect(JSON.stringify(body)).not.toContain("Gemini rate limit");
  });

  it("returns 500 when the Supabase query throws unexpectedly", async () => {
    mockSingle.mockRejectedValue(new Error("DB connection timeout"));

    const res = await POST(makeRequest({ req_id: "req-1", candidates: CANDIDATES }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Internal server error");
  });
});
