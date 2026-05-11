import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/triage/batchTriage", () => ({ processBatch: vi.fn() }));

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
vi.mock("svix", () => ({
  Webhook: vi.fn(function MockWebhook() {
    return {
      verify: vi.fn(() => {
        throw new Error("invalid signature");
      }),
    };
  }),
}));

import { auth } from "@clerk/nextjs/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { processBatch } from "@/lib/triage/batchTriage";
import { headers } from "next/headers";

import { POST as triagePOST } from "@/app/api/triage/route";
import { POST as uploadPOST } from "@/app/api/upload/route";
import { POST as webhookPOST } from "@/app/api/webhooks/clerk/route";
import { POST as referralAcceptPOST } from "@/app/api/referrals/[id]/accept/route";

const mockAuth = vi.mocked(auth);
const mockCreateServerClient = vi.mocked(createServerClient);
const mockProcessBatch = vi.mocked(processBatch);
const mockHeaders = vi.mocked(headers);

function makeTriageRequest(body: unknown) {
  return new NextRequest("http://localhost/api/triage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeUploadRequest(reqId: string) {
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
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ orgId: "org-1" } as never);
});

describe("/api/triage org isolation", () => {
  it("returns 404 for req_id that belongs to another org", async () => {
    const reqChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    mockCreateServerClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "requisitions") return reqChain;
        return { select: vi.fn() };
      }),
    } as never);

    const res = await triagePOST(
      makeTriageRequest({
        req_id: "req-other-org",
        candidates: [{ id: "cand-1", resume_text: "irrelevant" }],
      })
    );

    expect(res.status).toBe(404);
    expect(res.status).not.toBe(200);
  });

  it("returns 404 when a candidate id is not in the authorized requisition scope", async () => {
    const reqChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "req-1",
          title: "Backend",
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
    };

    const candidatesSelect = vi
      .fn()
      .mockReturnValue({ eq: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [{ id: "cand-1", resume_text: "ok" }], error: null }) }) });

    mockCreateServerClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "requisitions") return reqChain;
        if (table === "candidates") return { select: candidatesSelect };
        return { select: vi.fn() };
      }),
    } as never);

    const res = await triagePOST(
      makeTriageRequest({
        req_id: "req-1",
        candidates: [
          { id: "cand-1", resume_text: "resume 1" },
          { id: "cand-2", resume_text: "resume 2" },
        ],
      })
    );

    expect(res.status).toBe(404);
    expect(res.status).not.toBe(200);
    expect(mockProcessBatch).not.toHaveBeenCalled();
  });
});

describe("/api/upload org isolation", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ orgId: null } as never);

    const res = await uploadPOST(makeUploadRequest("req-1"));

    expect(res.status).toBe(401);
    expect(res.status).not.toBe(200);
  });

  it("returns 404 for req_id that belongs to another org", async () => {
    const reqChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    mockCreateServerClient.mockResolvedValue({
      from: vi.fn(() => reqChain),
      storage: {
        from: vi.fn(),
      },
    } as never);

    const res = await uploadPOST(makeUploadRequest("req-other-org"));

    expect(res.status).toBe(404);
    expect(res.status).not.toBe(200);
  });
});

describe("/api/referrals/[id]/accept BAC-001", () => {
  function makeAcceptRequest(referralId: string) {
    return new NextRequest(`http://localhost/api/referrals/${referralId}/accept`, {
      method: "POST",
    });
  }

  function makeSupabaseMock(referralData: unknown) {
    const recruiterChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "recruiter-1" }, error: null }),
    };
    const referralChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: referralData, error: null }),
    };
    return mockCreateServerClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "recruiters") return recruiterChain;
        if (table === "referrals") return referralChain;
        return { select: vi.fn() };
      }),
    } as never);
  }

  it("returns 404 (not 403) for a valid referral ID belonging to a different org", async () => {
    mockAuth.mockResolvedValue({ orgId: "org-1", userId: "user-1" } as never);
    // combined query (id + org_id filter) returns null — org mismatch is invisible
    makeSupabaseMock(null);

    const res = await referralAcceptPOST(
      new Request("http://localhost/api/referrals/referral-other-org/accept", { method: "POST" }),
      { params: Promise.resolve({ id: "referral-other-org" }) }
    );

    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("returns 404 with identical body for a completely fake referral ID", async () => {
    mockAuth.mockResolvedValue({ orgId: "org-1", userId: "user-1" } as never);
    makeSupabaseMock(null);

    const res = await referralAcceptPOST(
      new Request("http://localhost/api/referrals/00000000-dead-beef-0000-000000000000/accept", { method: "POST" }),
      { params: Promise.resolve({ id: "00000000-dead-beef-0000-000000000000" }) }
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("404 response body contains no information about whether the resource exists", async () => {
    mockAuth.mockResolvedValue({ orgId: "org-1", userId: "user-1" } as never);
    makeSupabaseMock(null);

    const crossOrgRes = await referralAcceptPOST(
      new Request("http://localhost/api/referrals/referral-other-org/accept", { method: "POST" }),
      { params: Promise.resolve({ id: "referral-other-org" }) }
    );
    const fakeRes = await referralAcceptPOST(
      new Request("http://localhost/api/referrals/fake-id/accept", { method: "POST" }),
      { params: Promise.resolve({ id: "fake-id" }) }
    );

    const crossOrgBody = await crossOrgRes.json();
    const fakeBody = await fakeRes.json();
    expect(crossOrgBody).toEqual(fakeBody);
    // must not leak org membership info — no "forbidden", "exists", "wrong org", etc.
    expect(JSON.stringify(crossOrgBody)).not.toMatch(/forbidden|exists|wrong.*org|unauthorized/i);
  });
});

describe("/api/webhooks/clerk access control", () => {
  it("returns 400 for forged/unsigned webhook requests", async () => {
    mockHeaders.mockResolvedValue({
      get: vi.fn((key: string) => {
        const values: Record<string, string> = {
          "svix-id": "id",
          "svix-timestamp": "ts",
          "svix-signature": "sig",
        };
        return values[key] ?? null;
      }),
    } as never);

    const res = await webhookPOST(new Request("http://localhost/api/webhooks/clerk", {
      method: "POST",
      body: JSON.stringify({ type: "user.created" }),
      headers: { "Content-Type": "application/json" },
    }));

    expect(res.status).toBe(400);
    expect(res.status).not.toBe(200);
  });
});
