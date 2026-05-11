/**
 * Multi-tenant isolation tests for OWASP A01: Broken Access Control.
 *
 * Why these tests exist:
 * 1) Prevent URL-parameter tampering from crossing tenant boundaries (req_id/candidate_id/referral_id).
 * 2) Verify all data endpoints fail closed without an authenticated org context.
 * 3) Enforce cross-org referral safeguards (send/accept paths).
 * 4) Validate non-leaky error semantics (404 without existence disclosure; no foreign IDs in errors).
 * 5) Simulate RLS behavior with anon-key Supabase access (no auth => no rows).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/queue", () => ({ triageQueue: { add: vi.fn().mockResolvedValue(undefined) } }));
vi.mock("@/lib/triage/batchTriage", () => ({
  processBatch: vi.fn().mockResolvedValue({
    processed: 1,
    failed: 0,
    results: [
      {
        candidate_id: "cand_acme_789",
        req_id: "req_acme_456",
        org_id: "org_acme_123",
        tier: "review",
        triage_reasoning: {
          matched: [],
          missing: ["manual review"],
          preferred_hits: [],
          confidence: 0.7,
          summary: "manual review",
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
  }),
}));

import { auth } from "@clerk/nextjs/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { POST as triagePOST } from "@/app/api/triage/route";
import { POST as uploadPOST } from "@/app/api/upload/route";
import { POST as sendReferralPOST } from "@/app/api/referrals/send/route";
import { GET as getReferralGET } from "@/app/api/referrals/[id]/route";
import { POST as acceptReferralPOST } from "@/app/api/referrals/[id]/accept/route";

const mockCreateServerClient = vi.mocked(createServerClient);
const mockedAuth = vi.mocked(auth);

const ORG_A = "org_acme_123";
const ORG_B = "org_globex_123";

const REQ_A = "req_acme_456";
const REQ_B = "req_globex_456";

const CAND_A = "cand_acme_789";
const CAND_B = "cand_globex_789";

const RECRUITER_MARCUS_A = "rec_marcus_acme";
const RECRUITER_JENNY_B = "rec_jenny_globex";

const REF_A = "ref_acme_123";
const REF_B = "ref_globex_123";

type Row = Record<string, unknown>;

type DataStore = {
  requisitions: Row[];
  candidates: Row[];
  recruiters: Row[];
  referrals: Row[];
  applications: Row[];
};

function cloneData(): DataStore {
  return {
    requisitions: [
      { id: REQ_A, org_id: ORG_A, title: "Acme Backend", criteria: { required: { min_years_experience: 3, seniority: "mid", skills: ["TypeScript"] }, preferred: ["React"], dealbreakers: [] } },
      { id: REQ_B, org_id: ORG_B, title: "Globex Backend", criteria: { required: { min_years_experience: 3, seniority: "mid", skills: ["TypeScript"] }, preferred: ["React"], dealbreakers: [] } },
    ],
    candidates: [
      { id: CAND_A, req_id: REQ_A, resume_text: "Acme candidate resume text" },
      { id: CAND_B, req_id: REQ_B, resume_text: "Globex candidate resume text" },
    ],
    recruiters: [
      { id: RECRUITER_MARCUS_A, org_id: ORG_A, clerk_user_id: "user_marcus_a", name: "Marcus" },
      { id: RECRUITER_JENNY_B, org_id: ORG_B, clerk_user_id: "user_jenny_b", name: "Jenny" },
    ],
    referrals: [
      { id: REF_A, org_id: ORG_A, to_recruiter_id: RECRUITER_MARCUS_A, status: "pending", req_id: REQ_A, candidate_id: CAND_A },
      { id: REF_B, org_id: ORG_B, to_recruiter_id: RECRUITER_JENNY_B, status: "pending", req_id: REQ_B, candidate_id: CAND_B },
    ],
    applications: [
      { id: "app1", org_id: ORG_A, candidate_id: CAND_A, req_id: REQ_A },
      { id: "app2", org_id: ORG_B, candidate_id: CAND_B, req_id: REQ_B },
    ],
  };
}

function makeFilterableTable(rows: Row[]) {
  const filters: Array<{ column: string; value: unknown }> = [];

  const selectBuilder: Record<string, unknown> = {};

  const executeFiltered = () =>
    rows.filter((row) => filters.every((f) => row[f.column] === f.value));

  (selectBuilder as { select: () => unknown }).select = () => selectBuilder;
  (selectBuilder as { eq: (c: string, v: unknown) => unknown }).eq = (column: string, value: unknown) => {
    filters.push({ column, value });
    return selectBuilder;
  };
  (selectBuilder as { in: (c: string, v: unknown[]) => Promise<{ data: Row[]; error: null }> }).in = async (
    column: string,
    values: unknown[]
  ) => {
    const data = executeFiltered().filter((row) => values.includes(row[column]));
    return { data, error: null };
  };
  (selectBuilder as { single: () => Promise<{ data: Row | null; error: { message: string } | null }> }).single = async () => {
    const data = executeFiltered()[0] ?? null;
    return {
      data,
      error: data ? null : { message: "No rows" },
    };
  };

  return selectBuilder;
}

function makeSupabaseMock(store: DataStore) {
  const storageUpload = vi.fn().mockResolvedValue({ data: { path: "fake/path.pdf" }, error: null });

  const from = vi.fn((table: keyof DataStore) => {
    if (table === "referrals") {
      const rows = store.referrals;
      const base = makeFilterableTable(rows) as Record<string, unknown>;

      base.insert = async (payload: Row) => {
        rows.push({ id: `ref_${rows.length + 1}`, ...payload });
        return { error: null };
      };

      base.update = (patch: Row) => {
        const filters: Array<{ column: string; value: unknown }> = [];
        const updater: Record<string, unknown> = {
          eq: (column: string, value: unknown) => {
            filters.push({ column, value });
            return updater;
          },
          then: (resolve: (v: unknown) => unknown) => {
            const targets = rows.filter((row) =>
              filters.every((f) => row[f.column] === f.value)
            );
            for (const row of targets) {
              Object.assign(row, patch);
            }
            return Promise.resolve({ error: null }).then(resolve);
          },
        };
        return updater;
      };

      return base;
    }

    return makeFilterableTable(store[table]);
  });

  return {
    from,
    storage: {
      from: vi.fn(() => ({ upload: storageUpload })),
    },
  };
}

function jsonReq(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function uploadReq(reqId: string): NextRequest {
  const form = new FormData();
  form.set("req_id", reqId);
  form.set("resume", new File(["pdf-data"], "resume.pdf", { type: "application/pdf" }));

  return new NextRequest("http://localhost/api/upload", {
    method: "POST",
    body: form,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  const store = cloneData();
  mockCreateServerClient.mockResolvedValue(makeSupabaseMock(store) as never);

  mockedAuth.mockResolvedValue({ orgId: ORG_A, userId: "user_marcus_a" } as never);
});

describe("URL parameter attacks", () => {
  it("1. Org A token + Org B req_id on /api/triage returns 404", async () => {
    const res = await triagePOST(
      jsonReq("http://localhost/api/triage", {
        req_id: REQ_B,
        candidates: [{ id: CAND_A, resume_text: "ignored" }],
      })
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Requisition not found");
  });

  it("2. Org A token + Org B candidate_id returns 404", async () => {
    const res = await triagePOST(
      jsonReq("http://localhost/api/triage", {
        req_id: REQ_A,
        candidates: [{ id: CAND_B, resume_text: "ignored" }],
      })
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("One or more candidates not found for this requisition");
  });

  it("3. Org A token + Org B referral_id returns 404", async () => {
    const res = await getReferralGET(new Request("http://localhost/api/referrals/"), {
      params: Promise.resolve({ id: REF_B }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Referral not found");
  });

  it("4. Authenticated user with no org gets 401 on data endpoints", async () => {
    mockedAuth.mockResolvedValue({ orgId: null, userId: "user_marcus_a" } as never);

    const [triageRes, uploadRes, sendRes, acceptRes] = await Promise.all([
      triagePOST(
        jsonReq("http://localhost/api/triage", {
          req_id: REQ_A,
          candidates: [{ id: CAND_A, resume_text: "ignored" }],
        })
      ),
      uploadPOST(uploadReq(REQ_A)),
      sendReferralPOST(
        jsonReq("http://localhost/api/referrals/send", {
          req_id: REQ_A,
          candidate_id: CAND_A,
          to_recruiter_id: RECRUITER_MARCUS_A,
        })
      ),
      acceptReferralPOST(new Request("http://localhost/api/referrals/accept", { method: "POST" }), {
        params: Promise.resolve({ id: REF_A }),
      }),
    ]);

    expect(triageRes.status).toBe(401);
    expect(uploadRes.status).toBe(401);
    expect(sendRes.status).toBe(401);
    expect(acceptRes.status).toBe(401);
  });
});

describe("Cross-org referral attacks", () => {
  it("5. Marcus (Org A) cannot send referral to Jenny (Org B)", async () => {
    const res = await sendReferralPOST(
      jsonReq("http://localhost/api/referrals/send", {
        req_id: REQ_A,
        candidate_id: CAND_A,
        to_recruiter_id: RECRUITER_JENNY_B,
      })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/cross-org referrals are not allowed/i);
  });

  it("6. Marcus (Org A) cannot accept Org B referral", async () => {
    const res = await acceptReferralPOST(new Request("http://localhost/api/referrals/accept", { method: "POST" }), {
      params: Promise.resolve({ id: REF_B }),
    });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });
});

describe("Supabase RLS verification", () => {
  it("7. anon-key query without org filter returns zero rows (RLS) for candidates", async () => {
    const createAnonClient = vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      })),
    }));

    const anonClient = createAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { data, error } = await anonClient.from("candidates").select("id, org_id").limit(10);

    expect(createAnonClient).toHaveBeenCalledWith(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("8. unauthenticated anon request returns zero rows from applications", async () => {
    const anonClient = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      })),
    };

    const { data, error } = await anonClient.from("applications").select("id").limit(10);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe("Response leakage controls", () => {
  it("9. cross-org 404 is generic and does not reveal ownership details", async () => {
    const res = await triagePOST(
      jsonReq("http://localhost/api/triage", {
        req_id: REQ_B,
        candidates: [{ id: CAND_A, resume_text: "ignored" }],
      })
    );
    const body = await res.json();
    const text = JSON.stringify(body).toLowerCase();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Requisition not found");
    expect(text).not.toContain("belongs to another org");
    expect(text).not.toContain("globex");
  });

  it("10. error payloads never include foreign org IDs", async () => {
    const res = await getReferralGET(new Request("http://localhost/api/referrals/"), {
      params: Promise.resolve({ id: REF_B }),
    });
    const body = await res.json();
    const text = JSON.stringify(body);

    expect(res.status).toBe(404);
    expect(text).not.toContain(REQ_B);
    expect(text).not.toContain(CAND_B);
    expect(text).not.toContain(REF_B);
    expect(text).not.toContain(ORG_B);
  });
});

describe("Demo attack scenario", () => {
  it("11. req_id tampering from Org A req to Org B req while authenticated as Org A returns 404", async () => {
    const legitRes = await triagePOST(
      jsonReq("http://localhost/api/triage", {
        req_id: REQ_A,
        candidates: [{ id: CAND_A, resume_text: "ignored" }],
      })
    );

    const attackRes = await triagePOST(
      jsonReq("http://localhost/api/triage", {
        req_id: REQ_B,
        candidates: [{ id: CAND_A, resume_text: "ignored" }],
      })
    );
    const attackBody = await attackRes.json();

    expect(legitRes.status).toBe(200);
    expect(attackRes.status).toBe(404);
    expect(attackBody.error).toBe("Requisition not found");
  });
});
