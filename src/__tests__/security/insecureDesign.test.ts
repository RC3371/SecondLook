import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/triage/batchTriage", () => ({ processBatch: vi.fn() }));

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { processBatch } from "@/lib/triage/batchTriage";
import { POST as triagePOST } from "@/app/api/triage/route";
import { POST as uploadPOST } from "@/app/api/upload/route";
import {
  MAX_CANDIDATES_PER_REQUEST,
  MAX_RECRUITER_NOTE_CHARS,
  MAX_UPLOAD_FILE_BYTES,
  recruiterNoteSchema,
} from "@/lib/validation/inputValidation";

const mockAuth = vi.mocked(auth);
const mockCreateClient = vi.mocked(createClient);
const mockProcessBatch = vi.mocked(processBatch);

const VALID_CRITERIA = {
  required: {
    min_years_experience: 3,
    seniority: "mid",
    skills: ["React"],
  },
  preferred: ["Next.js"],
  dealbreakers: [],
};

const makeTriageRequest = (body: unknown) =>
  new NextRequest("http://localhost/api/triage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const makeUploadRequest = (file: File, reqId = "req-1") => {
  const formData = new FormData();
  formData.append("resume", file);
  formData.append("req_id", reqId);

  return new NextRequest("http://localhost/api/upload", {
    method: "POST",
    body: formData,
  });
};

beforeEach(() => {
  vi.clearAllMocks();

  mockAuth.mockResolvedValue({ orgId: "org-1" } as never);
  mockProcessBatch.mockResolvedValue({
    processed: 1,
    failed: 0,
    results: [
      {
        candidate_id: "cand-1",
        req_id: "req-1",
        org_id: "org-1",
        tier: "review",
        triage_reasoning: {
          matched: [],
          missing: [],
          preferred_hits: [],
          confidence: 0.7,
          summary: "review",
          risk_flags: {
            keyword_stuffing: false,
            possible_ai_generated: false,
            prompt_injection: false,
            suspiciously_short: false,
          },
        },
        status: "pending",
      },
    ],
  } as never);

  const reqChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { id: "req-1", title: "Role", criteria: VALID_CRITERIA },
      error: null,
    }),
  };

  const candidatesChain = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          data: [{ id: "cand-1", resume_text: "resume" }],
          error: null,
        }),
      }),
    }),
  };

  mockCreateClient.mockResolvedValue({
    from: vi.fn((table: string) => {
      if (table === "requisitions") return reqChain;
      if (table === "candidates") return candidatesChain;
      return reqChain;
    }),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: { path: "resumes/path" }, error: null }),
      })),
    },
  } as never);
});

describe("input validation design guards", () => {
  it("limits candidates per /api/triage request", async () => {
    const candidates = Array.from(
      { length: MAX_CANDIDATES_PER_REQUEST + 1 },
      (_, i) => ({ id: `cand-${i}`, resume_text: "resume" })
    );

    const res = await triagePOST(makeTriageRequest({ req_id: "req-1", candidates }));
    expect(res.status).toBe(400);
    expect(mockProcessBatch).not.toHaveBeenCalled();
  });

  it("validates requisition criteria shape before sending to Gemini", async () => {
    const badReqChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "req-1", title: "Role", criteria: { unexpected: true } },
        error: null,
      }),
    };

    mockCreateClient.mockResolvedValueOnce({
      from: vi.fn(() => badReqChain),
    } as never);

    const res = await triagePOST(
      makeTriageRequest({
        req_id: "req-1",
        candidates: [{ id: "cand-1", resume_text: "resume" }],
      })
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "Requisition criteria is invalid" });
    expect(mockProcessBatch).not.toHaveBeenCalled();
  });

  it("enforces file type whitelist on upload (PDF/CSV only)", async () => {
    const badFile = new File(["x"], "resume.exe", {
      type: "application/x-msdownload",
    });

    const res = await uploadPOST(makeUploadRequest(badFile));
    expect(res.status).toBe(400);
  });

  it("enforces upload file size cap", async () => {
    const oversized = new File(["a".repeat(MAX_UPLOAD_FILE_BYTES + 1)], "resume.pdf", {
      type: "application/pdf",
    });

    const res = await uploadPOST(makeUploadRequest(oversized));
    expect(res.status).toBe(400);
  });

  it("enforces recruiter note max length", () => {
    const note = "a".repeat(MAX_RECRUITER_NOTE_CHARS + 1);
    const result = recruiterNoteSchema.safeParse(note);
    expect(result.success).toBe(false);
  });
});

describe("rate limiting design guards", () => {
  it("rate limits /api/triage requests", async () => {
    const body = {
      req_id: "req-1",
      candidates: [{ id: "cand-1", resume_text: "resume" }],
    };

    let finalResponse: Response | null = null;
    for (let i = 0; i < 21; i++) {
      finalResponse = await triagePOST(makeTriageRequest(body));
    }

    expect(finalResponse).not.toBeNull();
    expect(finalResponse!.status).toBe(429);
    expect(finalResponse!.headers.get("Retry-After")).toBeTruthy();
  });

  it("rate limits /api/upload requests", async () => {
    // Keep upload request cheap by making requisition lookup fail fast.
    mockCreateClient.mockResolvedValueOnce({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
      storage: { from: vi.fn() },
    } as never);

    const req = () =>
      makeUploadRequest(new File(["pdf"], "resume.pdf", { type: "application/pdf" }));

    let finalResponse: Response | null = null;
    for (let i = 0; i < 31; i++) {
      // Re-apply the same fast-fail mock for each call.
      mockCreateClient.mockResolvedValueOnce({
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
        storage: { from: vi.fn() },
      } as never);
      finalResponse = await uploadPOST(req());
    }

    expect(finalResponse).not.toBeNull();
    expect(finalResponse!.status).toBe(429);
    expect(finalResponse!.headers.get("Retry-After")).toBeTruthy();
  });
});
