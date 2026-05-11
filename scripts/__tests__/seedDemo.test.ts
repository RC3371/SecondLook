import { describe, expect, it } from "vitest";

import {
  APPLICATIONS,
  CANDIDATES,
  ORGANIZATIONS,
  RECRUITERS,
  REQUISITIONS,
} from "../seedDemo";

type TriageReasoningShape = {
  matched?: unknown;
  missing?: unknown;
  preferred_hits?: unknown;
  confidence?: unknown;
  summary?: unknown;
  risk_flags?: {
    keyword_stuffing?: boolean;
    prompt_injection?: boolean;
  };
};

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const RAW_EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const WORD_RE = /\b[\w'-]+\b/g;

const getWordCount = (text: string) => (text.match(WORD_RE) ?? []).length;

describe("seedDemo data validation", () => {
  it("1-2. has exactly one organization with clerk_org_id and name", () => {
    expect(ORGANIZATIONS).toHaveLength(1);
    expect(ORGANIZATIONS[0]).toEqual(
      expect.objectContaining({
        clerk_org_id: expect.any(String),
        name: expect.any(String),
      })
    );
  });

  it("3-5. has exactly two recruiters (Marcus and Jenny) with valid emails and org reference", () => {
    expect(RECRUITERS).toHaveLength(2);
    const recruiterNames = RECRUITERS.map((r) => r.name);
    expect(recruiterNames).toContain("Marcus Chen");
    expect(recruiterNames).toContain("Jenny Park");

    for (const recruiter of RECRUITERS) {
      expect(recruiter).toEqual(
        expect.objectContaining({
          email: expect.any(String),
          name: expect.any(String),
          org_id: ORGANIZATIONS[0].id,
        })
      );
      expect(EMAIL_RE.test(recruiter.email)).toBe(true);
    }
  });

  it("6-9. has exactly two requisitions with required/preferred skills and seniority", () => {
    expect(REQUISITIONS).toHaveLength(2);
    const reqTitles = REQUISITIONS.map((r) => r.title);
    expect(reqTitles).toContain("Senior Backend Engineer");
    expect(reqTitles).toContain("Frontend Engineer");

    for (const req of REQUISITIONS) {
      const requiredSkills = req.criteria.required.skills;
      const preferredSkills = req.criteria.preferred;
      const seniority = req.criteria.required.seniority;

      expect(Array.isArray(requiredSkills)).toBe(true);
      expect(requiredSkills.length).toBeGreaterThan(0);

      expect(Array.isArray(preferredSkills)).toBe(true);
      expect(preferredSkills.length).toBeGreaterThan(0);

      expect(typeof seniority).toBe("string");
      expect(seniority.length).toBeGreaterThan(0);
    }
  });

  it("10-15. candidates count/distribution/risk flags are valid", () => {
    expect(CANDIDATES).toHaveLength(20);

    for (const candidate of CANDIDATES) {
      expect(getWordCount(candidate.resume_text)).toBeGreaterThanOrEqual(300);
    }

    const topCount = APPLICATIONS.filter((a) => a.tier === "top").length;
    const autoRejectCount = APPLICATIONS.filter((a) => a.tier === "auto_reject").length;
    expect(topCount).toBeGreaterThanOrEqual(5);
    expect(autoRejectCount).toBeGreaterThanOrEqual(3);

    const hasKeywordStuffing = APPLICATIONS.some((application) => {
      const reasoning = application.triage_reasoning as TriageReasoningShape;
      return reasoning.risk_flags?.keyword_stuffing === true;
    });

    const hasPromptInjection = APPLICATIONS.some((application) => {
      const reasoning = application.triage_reasoning as TriageReasoningShape;
      return reasoning.risk_flags?.prompt_injection === true;
    });

    expect(hasKeywordStuffing).toBe(true);
    expect(hasPromptInjection).toBe(true);
  });

  it("16-20. triage_reasoning integrity checks", () => {
    for (const application of APPLICATIONS) {
      expect(application.triage_reasoning).toBeTruthy();
      expect(typeof application.triage_reasoning).toBe("object");

      const reasoning = application.triage_reasoning as TriageReasoningShape;

      expect(Array.isArray(reasoning.matched)).toBe(true);
      expect(Array.isArray(reasoning.missing)).toBe(true);
      expect(Array.isArray(reasoning.preferred_hits)).toBe(true);

      expect(typeof reasoning.confidence).toBe("number");
      expect((reasoning.confidence as number) >= 0).toBe(true);
      expect((reasoning.confidence as number) <= 1).toBe(true);

      expect(typeof reasoning.summary).toBe("string");
      expect((reasoning.summary as string).trim().length).toBeGreaterThan(0);

      if (application.tier === "auto_reject") {
        expect((reasoning.missing as unknown[]).length).toBeGreaterThan(0);
      }
    }
  });

  it("21-23. resume content sanity checks", () => {
    for (const candidate of CANDIDATES) {
      expect(candidate.resume_text.match(RAW_EMAIL_RE)).toBeNull();
    }

    const injectionCandidate = CANDIDATES.find((c) => c.name === "River Patel");
    expect(injectionCandidate).toBeDefined();
    expect(injectionCandidate?.resume_text).toMatch(
      /ignore all previous instructions|disregard the candidate evaluation criteria|override mode/i
    );

    const uniqueResumes = new Set(CANDIDATES.map((c) => c.resume_text));
    expect(uniqueResumes.size).toBe(CANDIDATES.length);
  });
});
