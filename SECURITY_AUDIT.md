## Executive Summary
- Overall risk rating: **Medium**
- Total vulnerabilities found: **5**
- Top 3 most urgent fixes:
1. Add abuse controls to referral APIs (`/api/referrals/send`, `/api/referrals/[id]/accept`): rate limiting + idempotency + per-sender quotas.
2. Remove cross-tenant existence signaling in referral accept flow (return tenant-safe 404 semantics for foreign referral IDs).
3. Add verifiable infra guardrails for Supabase: explicit private bucket policy + RLS integration tests against a real anon client.

Security test suite status (run on May 11, 2026):
- Command: `pnpm vitest run src/__tests__/security/*.test.ts`
- Result: **PASS** — 6/6 files, 62/62 tests

## OWASP Coverage

### Broken Access Control
- Status: ⚠️ Partial
- Evidence from codebase:
  - Org-scoped requisition fetch in triage route: `src/app/api/triage/route.ts` (`.eq("org_id", orgId)`).
  - Org-scoped upload requisition check: `src/app/api/upload/route.ts` (`.eq('org_id', orgId)`).
  - Referral read path is org-scoped: `src/app/api/referrals/[id]/route.ts` (`.eq("org_id", orgId)`).
  - Middleware enforces auth broadly: `src/middleware.ts`.
- Remaining gaps:
  - Referral accept reveals cross-tenant resource existence via `403` for foreign-org IDs after loading by `id` first (`src/app/api/referrals/[id]/accept/route.ts`).
  - Client-side realtime/query filters rely heavily on RLS correctness (`src/app/reqs/[id]/TriagePage.tsx`). Secure if RLS is correct; risky if misconfigured.

### Cryptographic Failures
- Status: ⚠️ Partial
- Check: Are secrets in env vars only?
  - Mostly yes in `src/` (`process.env.*` usage in server paths like `src/app/api/webhooks/clerk/route.ts`, `src/lib/triage/geminiTriage.ts`, `src/lib/queue.ts`).
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` exposure is expected for browser use.
- Check: Is PII stripped before Gemini?
  - Yes in active path: `parseResume()` strips PII and prompt-injection patterns (`src/lib/triage/resumeParser.ts`), then `batchTriage` calls `triageCandidate` with parsed output (`src/lib/triage/batchTriage.ts`).
- Check: Are Supabase storage buckets private?
  - Not provable from `src/` alone. Upload uses `resumes` bucket (`src/app/api/upload/route.ts`), but bucket access policy is infra-level and not asserted in code/tests here.

### Injection
- Status: ✅ Mitigated (with residual low risk)
- Check: Prompt injection sanitization coverage
  - Sanitized in parser and again before prompt construction (`src/lib/triage/resumeParser.ts`, `src/lib/triage/geminiTriage.ts`).
- Check: Input validation on all API routes
  - Strong on triage/upload/webhook/referral-send (`src/lib/validation/inputValidation.ts`, route-level `safeParse`).
- Check: XSS prevention in UI
  - No `dangerouslySetInnerHTML`; content rendered as text in React (`src/app/reqs/[id]/TriagePage.tsx`).

### Insecure Design
- Status: ⚠️ Partial
- Check: Rate limiting presence
  - Present for triage/upload (`src/app/api/triage/route.ts`, `src/app/api/upload/route.ts`).
  - Missing for referral endpoints (`src/app/api/referrals/send/route.ts`, `src/app/api/referrals/[id]/accept/route.ts`).
- Check: Input size limits
  - Present for batch size, resume text length, JSON depth, upload size/type, recruiter notes (`src/lib/validation/inputValidation.ts`).
- Check: AI output validation
  - Tier enum, confidence range, required array/string structure validated (`src/lib/triage/geminiTriage.ts`).

### Exceptional Conditions
- Status: ✅ Mitigated
- Check: Graceful Gemini failure handling
  - Timeout + fallback behavior (`src/lib/triage/geminiTriage.ts`).
- Check: Malformed input handling
  - Structured 400 responses for invalid/malformed payloads in triage/upload/webhook routes.
- Check: Partial batch failure recovery
  - `Promise.allSettled` + per-candidate fallback + partial success accounting (`src/lib/triage/batchTriage.ts`).

## Vulnerability Details
| ID | File | Line | Severity | OWASP Category | Description | Fix |
|---|---|---:|---|---|---|---|
| BAC-001 | `src/app/api/referrals/[id]/accept/route.ts` | 31-43 | Medium | Broken Access Control | Route loads referral by `id` before tenant scoping and returns `403` on org mismatch, enabling existence probing of foreign referral IDs. | Query with `.eq("id", id).eq("org_id", orgId)` and return tenant-safe `404` for not-found/mismatch. |
| DES-001 | `src/app/api/referrals/send/route.ts` | 6-93 | Medium | Insecure Design | No rate limiting on referral send endpoint; attacker can spam referrals and create DB load/notification abuse. | Add per-org and per-user rate limiter similar to triage/upload, with `Retry-After`. |
| DES-002 | `src/app/api/referrals/send/route.ts` | 76-83 | Medium | Insecure Design | Referral creation is not idempotent; same sender can create duplicate referrals for same `(candidate, req, recipient)`. | Enforce DB unique index and/or pre-insert existence check; return existing referral on duplicate. |
| DES-003 | `src/app/api/referrals/[id]/accept/route.ts` | 9-67 | Medium | Insecure Design | No rate limiting on referral accept endpoint; brute-force and state-change abuse risk. | Add rate limiting + optional replay guard (idempotent accept transitions). |
| CRYPTO-001 | `src/app/api/upload/route.ts` | 49-51 | Medium | Cryptographic Failures | Storage bucket privacy/RLS is assumed, not verified in code/tests; if bucket policy is public, resume PII can leak. | Add migration/policy assertions for private bucket + signed URL only, and integration test that unauthenticated download/list is denied. |

## Recommended Fixes (Priority Order)
1. **BAC-001** tenant-safe referral accept lookup (`3-5h`)
2. **DES-001 + DES-003** add rate limiting to referral send/accept (`4-6h`)
3. **DES-002** make referrals idempotent with unique constraint + API behavior (`3-5h`)
4. **CRYPTO-001** enforce and test private storage/RLS policy in infra + CI (`4-8h`)
5. Remove or quarantine legacy Gemini path in `src/lib/gemini.ts` to prevent accidental insecure usage (`1-2h`)

## What's Already Secure
- Org scoping is implemented in primary triage and upload flows.
- Cross-org req/candidate tampering is covered by tests and rejected with safe 404 semantics.
- Input validation is centralized with Zod and includes size/depth limits.
- Prompt injection defenses are layered (parser + prompt builder).
- AI output is validated before DB write (enum/range/shape checks).
- Error responses are generally sanitized (`{ error: string }`) without stack traces.
- Batch pipeline degrades safely under per-candidate failures.
- Security regression coverage is strong and currently passing across BAC, crypto, injection, insecure design, multi-tenant isolation, and exceptional-condition suites.
