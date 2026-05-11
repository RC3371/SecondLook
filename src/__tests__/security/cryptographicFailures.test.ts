import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/triage/batchTriage", () => ({ processBatch: vi.fn() }));

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
vi.mock("svix", () => ({
  Webhook: vi.fn(function MockWebhook() {
    return { verify: vi.fn(() => ({ type: "organization.created", data: { id: "org-1", name: "Acme" } })) };
  }),
}));

import { auth } from "@clerk/nextjs/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { processBatch } from "@/lib/triage/batchTriage";
import { headers } from "next/headers";
import { createClient as createAdminSupabaseClient } from "@supabase/supabase-js";
import { Webhook } from "svix";

import { POST as triagePOST } from "@/app/api/triage/route";
import { POST as uploadPOST } from "@/app/api/upload/route";
import { POST as webhookPOST } from "@/app/api/webhooks/clerk/route";

const mockAuth = vi.mocked(auth);
const mockCreateServerClient = vi.mocked(createServerClient);
const mockProcessBatch = vi.mocked(processBatch);
const mockHeaders = vi.mocked(headers);
const mockCreateAdminSupabaseClient = vi.mocked(createAdminSupabaseClient);
const mockWebhook = vi.mocked(Webhook);

const assertErrorShape = async (res: Response, expectedStatus: number) => {
  expect(res.status).toBe(expectedStatus);
  const body = (await res.json()) as Record<string, unknown>;
  expect(Object.keys(body)).toEqual(["error"]);
  expect(typeof body.error).toBe("string");
  expect((body.error as string).length).toBeGreaterThan(0);
  const serialized = JSON.stringify(body).toLowerCase();
  expect(serialized).not.toMatch(/stack|select\s+\*|postgres|supabase|gemini|apikey|service_role|token|trace|at\s+\w+/);
};

const makeTriageRequest = (body: unknown) =>
  new NextRequest("http://localhost/api/triage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const makeUploadRequest = (reqId: string) => {
  const formData = new FormData();
  formData.append(
    "resume",
    new File(["resume text"], "resume.pdf", { type: "application/pdf" })
  );
  formData.append("req_id", reqId);

  return new NextRequest("http://localhost/api/upload", {
    method: "POST",
    body: formData,
  });
};

beforeEach(() => {
  vi.clearAllMocks();

  mockAuth.mockResolvedValue({ orgId: "org-1" } as never);

  const reqChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: {
        id: "req-1",
        title: "Req",
        criteria: {
          required: {
            min_years_experience: 3,
            seniority: "mid",
            skills: ["React"],
          },
          preferred: ["Next.js"],
          dealbreakers: [],
        },
      },
      error: null,
    }),
    in: vi.fn().mockResolvedValue({
      data: [{ id: "cand-1", resume_text: "clean resume text" }],
      error: null,
    }),
  };

  mockCreateServerClient.mockResolvedValue({
    from: vi.fn((table: string) => {
      if (table === "requisitions") return reqChain;
      if (table === "candidates") return reqChain;
      return reqChain;
    }),
    storage: {
      from: vi.fn(() => ({ upload: vi.fn().mockResolvedValue({ data: { path: "resumes/x" }, error: null }) })),
    },
  } as never);

  mockProcessBatch.mockResolvedValue({
    processed: 1,
    failed: 0,
    results: [
      {
        candidate_id: "cand-1",
        req_id: "req-1",
        org_id: "org-1",
        tier: "strong",
        triage_reasoning: {
          matched: ["Python"],
          missing: [],
          preferred_hits: [],
          confidence: 0.8,
          summary: "Strong",
          raw_gemini_response: "VERY_SENSITIVE_FULL_MODEL_PAYLOAD",
        },
        status: "pending",
      },
    ],
  } as never);

  mockHeaders.mockResolvedValue({
    get: vi.fn((key: string) => {
      const map: Record<string, string> = {
        "svix-id": "id",
        "svix-timestamp": "ts",
        "svix-signature": "sig",
      };
      return map[key] ?? null;
    }),
  } as never);

  mockCreateAdminSupabaseClient.mockReturnValue({
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "org-1" }, error: null }),
    })),
  } as never);

  mockWebhook.mockImplementation(function MockWebhook() {
    return {
      verify: vi.fn(() => ({ type: "organization.created", data: { id: "org-1", name: "Acme" } })),
    } as never;
  });
});

describe("triage API output sanitization", () => {
  it("never includes raw Gemini API response payloads in success response", async () => {
    const res = await triagePOST(
      makeTriageRequest({
        req_id: "req-1",
        candidates: [{ id: "cand-1", resume_text: "attempted client text" }],
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual(["failed", "processed", "success", "tiers"]);
    expect(JSON.stringify(body)).not.toContain("VERY_SENSITIVE_FULL_MODEL_PAYLOAD");
    expect(JSON.stringify(body).toLowerCase()).not.toContain("gemini");
  });
});

describe("error response shape across API routes", () => {
  it("/api/triage returns only { error: string } on internal failures", async () => {
    mockProcessBatch.mockRejectedValueOnce(new Error("Gemini failure: raw response {token:abc}"));

    const res = await triagePOST(
      makeTriageRequest({
        req_id: "req-1",
        candidates: [{ id: "cand-1", resume_text: "resume" }],
      })
    );

    await assertErrorShape(res, 500);
  });

  it("/api/upload returns only { error: string } when upload fails", async () => {
    mockCreateServerClient.mockResolvedValueOnce({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: "req-1" }, error: null }),
      })),
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "bucket policy denied for postgres://user:pass@host" },
          }),
        })),
      },
    } as never);

    const res = await uploadPOST(makeUploadRequest("req-1"));
    await assertErrorShape(res, 500);
  });

  it("/api/webhooks/clerk returns only { error: string } for invalid signatures", async () => {
    mockWebhook.mockImplementationOnce(function MockWebhookInvalid() {
      return {
        verify: vi.fn(() => {
          throw new Error("signature mismatch with secret redacted-secret");
        }),
      } as never;
    });

    const res = await webhookPOST(
      new Request("http://localhost/api/webhooks/clerk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "organization.created" }),
      })
    );

    await assertErrorShape(res, 400);
  });
});
