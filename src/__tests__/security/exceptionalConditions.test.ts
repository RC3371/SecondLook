import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn(function MockGoogleGenerativeAI() {
    return {
      getGenerativeModel: vi.fn(function MockGetModel() {
        return { generateContent: mockGenerateContent };
      }),
    };
  }),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { parseResume } from "@/lib/triage/resumeParser";
import { processBatch } from "@/lib/triage/batchTriage";
import { triageCandidate } from "@/lib/triage/geminiTriage";
import { POST as triagePOST } from "@/app/api/triage/route";

const mockAuth = vi.mocked(auth);
const mockCreateClient = vi.mocked(createClient);

const VALID_CRITERIA = {
  required: {
    min_years_experience: 3,
    seniority: "mid",
    skills: ["TypeScript"],
  },
  preferred: ["React"],
  dealbreakers: ["no coding experience"],
};

const VALID_REQ = {
  id: "req-1",
  title: "Senior Engineer",
  criteria: VALID_CRITERIA,
};

function makeCandidate(id: string, resumeText = "2019-2024 Software Engineer TypeScript React") {
  return { id, resume_text: resumeText };
}

function makeTriageRequest(body: string, contentType = "application/json"): NextRequest {
  return new NextRequest("http://localhost/api/triage", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
}

function makeDeepObject(depth: number): unknown {
  let cursor: Record<string, unknown> = { leaf: true };
  for (let i = 0; i < depth; i++) {
    cursor = { nested: cursor };
  }
  return cursor;
}

function assertFriendlyErrorBody(body: unknown) {
  expect(body).toBeTruthy();
  expect(typeof body).toBe("object");
  const payload = body as Record<string, unknown>;
  expect(typeof payload.error).toBe("string");
  expect((payload.error as string).length).toBeGreaterThan(0);

  const s = JSON.stringify(body).toLowerCase();
  expect(s).not.toContain("stack");
  expect(s).not.toContain("node_modules");
  expect(s).not.toContain("/users/");
  expect(s).not.toContain(" at ");
}

function configureSupabaseForBatch(options?: {
  failCandidateIds?: Set<string>;
}) {
  const failIds = options?.failCandidateIds ?? new Set<string>();

  const mockUpsert = vi.fn(async (row: { candidate_id: string }) => {
    if (failIds.has(row.candidate_id)) {
      return { error: { message: "connection dropped" } };
    }
    return { error: null };
  });

  const mockFrom = vi.fn(() => ({ upsert: mockUpsert }));

  mockCreateClient.mockResolvedValue({
    from: mockFrom,
  } as never);

  return { mockUpsert, mockFrom };
}

beforeEach(() => {
  vi.clearAllMocks();

  mockAuth.mockResolvedValue({ orgId: "org-1" } as never);

  mockGenerateContent.mockResolvedValue({
    response: {
      text: () =>
        JSON.stringify({
          tier: "review",
          matched: ["Has relevant engineering experience"],
          missing: ["Needs deeper distributed systems evidence"],
          preferred_hits: ["React"],
          confidence: 0.71,
          summary: "Mixed signal, keep in manual review",
        }),
    },
  });

  configureSupabaseForBatch();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Resume parser fuzzing", () => {
  it("1. empty string returns null-like fields without throwing", () => {
    const { parsed, risks } = parseResume("");

    expect(parsed.years_of_experience).toBeNull();
    expect(parsed.most_recent_title).toBeNull();
    expect(parsed.most_recent_company).toBeNull();
    expect(parsed.skills).toEqual([]);
    expect(typeof risks.prompt_injection).toBe("boolean");
  });

  it("2. whitespace-only input is handled gracefully", () => {
    const { parsed } = parseResume("   \n\t  ");

    expect(parsed.total_jobs).toBe(0);
    expect(parsed.skills).toEqual([]);
    expect(parsed.raw_text.trim()).toBe("");
  });

  it("3. binary-like garbage does not crash", () => {
    const { parsed } = parseResume("ÿÿÿÿ\x00\x01\x02");

    expect(parsed).toBeTruthy();
    expect(parsed.raw_text).not.toContain("\x00");
  });

  it("4. numeric-only resume is handled", () => {
    const { parsed } = parseResume("12345678901234567890");

    expect(parsed.total_jobs).toBe(0);
    expect(parsed.raw_text).toContain("12345678901234567890");
  });

  it("5. extremely long single token does not hang or crash", () => {
    const hugeWord = "A".repeat(50_000);

    const { parsed } = parseResume(hugeWord);
    expect(parsed.raw_text.length).toBe(50_000);
  });

  it("6. unicode edge resumes (Arabic, Chinese, emoji) do not crash", () => {
    const unicodeResume = "مهندس برمجيات خبرة خمس سنوات\n软件工程师 五年经验\n🎯💼🚀";

    const { parsed } = parseResume(unicodeResume);
    expect(parsed.raw_text).toContain("🎯💼🚀");
  });

  it("7. valid JSON-looking resume is treated as plain text", () => {
    const jsonResume = '{"name":"Mallory","skills":["TypeScript"],"years":4}';

    const { parsed } = parseResume(jsonResume);

    expect(parsed.raw_text).toContain('"skills"');
    expect(parsed.total_jobs).toBe(0);
  });

  it("8. null-byte payload is sanitized", () => {
    const { parsed } = parseResume("abc\x00\x00\x00def");

    expect(parsed.raw_text).toBe("abcdef");
  });
});

describe("Batch processor fuzzing", () => {
  it("9. one valid candidate plus one null entry: valid processed, null skipped safely", async () => {
    const batch = await processBatch(
      [makeCandidate("cand-valid"), null as unknown as { id: string; resume_text: string }],
      VALID_REQ,
      "org-1"
    );

    expect(batch.processed).toBe(1);
    expect(batch.failed).toBe(1);
    expect(batch.results[0].candidate_id).toBe("cand-valid");
  });

  it("10. resume_text number type confusion does not crash", async () => {
    const batch = await processBatch(
      [{ id: "cand-num", resume_text: 12345 as unknown as string }],
      VALID_REQ,
      "org-1"
    );

    expect(batch.failed).toBe(0);
    expect(batch.processed).toBe(1);
    expect(batch.results[0].tier).toBe("review");
  });

  it("11. empty req.criteria object handled gracefully", async () => {
    const batch = await processBatch(
      [makeCandidate("cand-1")],
      {
        id: "req-empty",
        title: "Role",
        criteria: {} as never,
      },
      "org-1"
    );

    expect(batch.failed).toBe(0);
    expect(batch.processed).toBe(1);
    expect(batch.results[0].tier).toBe("review");
  });

  it("12. req.criteria.required null handled gracefully", async () => {
    const batch = await processBatch(
      [makeCandidate("cand-1")],
      {
        id: "req-null",
        title: "Role",
        criteria: {
          required: null,
          preferred: [],
          dealbreakers: [],
        } as never,
      },
      "org-1"
    );

    expect(batch.failed).toBe(0);
    expect(batch.processed).toBe(1);
    expect(batch.results[0].tier).toBe("review");
  });

  it("13. invalid UUID-like candidate id is rejected cleanly while batch continues", async () => {
    const { mockUpsert } = configureSupabaseForBatch({
      failCandidateIds: new Set(["not-a-uuid"]),
    });

    const batch = await processBatch(
      [makeCandidate("cand-ok"), makeCandidate("not-a-uuid")],
      VALID_REQ,
      "org-1"
    );

    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(batch.processed).toBe(1);
    expect(batch.failed).toBe(1);
    expect(batch.results[0].candidate_id).toBe("cand-ok");
  });
});

describe("API route fuzzing", () => {
  it("14. text/plain body to JSON endpoint returns 400 with friendly JSON error", async () => {
    const res = await triagePOST(
      makeTriageRequest(
        JSON.stringify({ req_id: "req-1", candidates: [makeCandidate("cand-1")] }),
        "text/plain"
      )
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    assertFriendlyErrorBody(body);
  });

  it("15. malformed JSON body returns 400 without crashing", async () => {
    const res = await triagePOST(
      makeTriageRequest('{"req_id": "abc"', "application/json")
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    assertFriendlyErrorBody(body);
  });

  it("16. req_id as number is rejected safely", async () => {
    const res = await triagePOST(
      makeTriageRequest(
        JSON.stringify({ req_id: 123, candidates: [makeCandidate("cand-1")] })
      )
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    assertFriendlyErrorBody(body);
  });

  it("17. candidates as string is rejected with clear 400", async () => {
    const res = await triagePOST(
      makeTriageRequest(JSON.stringify({ req_id: "req-1", candidates: "hello" }))
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    assertFriendlyErrorBody(body);
  });

  it("18. deeply nested JSON body is rejected without stack overflow", async () => {
    const res = await triagePOST(
      makeTriageRequest(JSON.stringify(makeDeepObject(1000)))
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    assertFriendlyErrorBody(body);
  });
});

describe("Network exceptional conditions", () => {
  it("19. Gemini 429-like error yields graceful fallback without unhandled exception", async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error("429 Too Many Requests"));

    const batch = await processBatch([makeCandidate("cand-rate-limit")], VALID_REQ, "org-1");

    expect(batch.failed).toBe(0);
    expect(batch.processed).toBe(1);
    expect(batch.results[0].tier).toBe("review");
    expect(batch.results[0].triage_reasoning.summary.toLowerCase()).toContain("review");
  });

  it("20. Supabase connection drop mid-batch preserves already processed rows", async () => {
    configureSupabaseForBatch({
      failCandidateIds: new Set(["cand-fail"]),
    });

    const batch = await processBatch(
      [makeCandidate("cand-ok"), makeCandidate("cand-fail")],
      VALID_REQ,
      "org-1"
    );

    expect(batch.processed).toBe(1);
    expect(batch.failed).toBe(1);
    expect(batch.results[0].candidate_id).toBe("cand-ok");
  });

  it("21. Gemini response delayed past timeout returns safe fallback", async () => {
    vi.useFakeTimers();

    mockGenerateContent.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                response: {
                  text: () =>
                    JSON.stringify({
                      tier: "top",
                      matched: ["everything"],
                      missing: ["none"],
                      preferred_hits: ["all"],
                      confidence: 1,
                      summary: "Late response",
                    }),
                },
              }),
            30_000
          );
        })
    );

    const parsed = parseResume("2018-2024 Senior engineer TypeScript React").parsed;

    const pending = triageCandidate(parsed, VALID_CRITERIA, "timeout-case");
    await vi.advanceTimersByTimeAsync(10_100);
    const result = await pending;

    expect(result.tier).toBe("review");
    expect(result.confidence).toBe(0);
    expect(result.summary.toLowerCase()).toContain("review");
  });
});
