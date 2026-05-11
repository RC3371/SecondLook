import { describe, expect, it } from "vitest";
import { preFilterCandidate } from "../preFilter";
import type { RequisitionCriteria, PreFilterResult } from "../preFilter";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a RequisitionCriteria with sensible defaults, overriding only what
 * each test cares about.
 */
function req(
  overrides: Partial<RequisitionCriteria["required"]>
): RequisitionCriteria {
  return {
    required: {
      min_years_experience: 0,
      seniority: "mid",
      ...overrides,
    },
    dealbreakers: [],
  };
}

/**
 * Pad a core snippet to at least `min` characters using a filler that
 * intentionally introduces no year, seniority, degree, or remote signals.
 * This isolates the specific signal being tested in each case.
 */
function withPad(core: string, min = 220): string {
  const pad =
    " A thoughtful team member committed to professional growth and delivering quality work. Skilled in stakeholder communication and comfortable working across functional boundaries to reach shared objectives and build consensus.";
  let text = core;
  while (text.length < min) text += pad;
  return text;
}

/**
 * Shared invariant assertions for every rejection result:
 *   - passed is false
 *   - rejectionReason is a non-empty string
 *   - confidence is in [0.7, 1] (we never auto-reject with low confidence)
 */
function expectRejection(result: PreFilterResult): void {
  expect(result.passed, "passed").toBe(false);
  expect(result.rejectionReason, "rejectionReason must be set on rejection").toBeDefined();
  expect(result.rejectionReason!.length, "rejectionReason must be non-empty").toBeGreaterThan(0);
  expect(result.confidence, "confidence must be in [0, 1]").toBeGreaterThanOrEqual(0);
  expect(result.confidence, "confidence must be in [0, 1]").toBeLessThanOrEqual(1);
  expect(result.confidence, "rejections must have confidence >= 0.7").toBeGreaterThanOrEqual(0.7);
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("preFilterCandidate", () => {
  // ── SHOULD REJECT ─────────────────────────────────────────────────────────
  //
  // These cases have clear, quantifiable disqualifying signals and a high enough
  // confidence score (>= 0.70) that the pre-filter makes the call without AI.

  describe("SHOULD REJECT (passed=false, confidence >= 0.7)", () => {
    it("1. new-grad keyword in resume against a senior-level req", () => {
      // "class of 202" is a substring of "Class of 2024" — triggers the keyword match.
      // checkSeniority returns confidence=0.80 for a senior role.
      const resume = withPad(
        "Class of 2024 computer science graduate. Seeking opportunities in software engineering."
      );
      const result = preFilterCandidate(
        resume,
        req({ seniority: "senior", min_years_experience: 6 })
      );

      expectRejection(result);
      expect(result.rejectionReason).toMatch(/class of 202/i);
      expect(result.confidence).toBe(0.8); // senior → exactly 0.80
    });

    it("1b. 'recent graduate' keyword also triggers new-grad rejection for senior role", () => {
      const resume = withPad(
        "Recent graduate with a B.S. in Computer Science. Strong academic background in algorithms and data structures."
      );
      const result = preFilterCandidate(
        resume,
        req({ seniority: "senior", min_years_experience: 6 })
      );

      expectRejection(result);
      expect(result.rejectionReason).toMatch(/recent graduate/i);
    });

    it("1c. new-grad signal is fine for a junior role (should NOT reject)", () => {
      // The preFilter must not punish candidates for matching the role's seniority.
      const resume = withPad(
        "Class of 2024 graduate seeking an entry-level junior position in software engineering."
      );
      const result = preFilterCandidate(
        resume,
        req({ seniority: "junior", min_years_experience: 0 })
      );

      expect(result.passed).toBe(true);
    });

    it("3. 'remote only' signal when req specifies an onsite location", () => {
      const resume = withPad(
        "Experienced software developer. Remote only. Prefer distributed teams."
      );
      const result = preFilterCandidate(
        resume,
        req({ location: "San Francisco, CA", seniority: "mid" })
      );

      expectRejection(result);
      expect(result.rejectionReason).toMatch(/remote-only preference/i);
      expect(result.rejectionReason).toContain("San Francisco, CA");
      expect(result.confidence).toBe(0.8);
    });

    it("3b. 'will not relocate' also triggers remote rejection for onsite role", () => {
      const resume = withPad(
        "8 years of experience in backend engineering. Will not relocate. Seeking remote-first companies."
      );
      const result = preFilterCandidate(
        resume,
        req({ location: "Austin, TX", seniority: "senior", min_years_experience: 6 })
      );

      expectRejection(result);
      expect(result.rejectionReason).toMatch(/will not relocate/i);
    });

    it("5. 1 year of experience when role requires 8+, confidence >= 0.7", () => {
      // Explicit "X years of experience" pattern → confidence 0.90 → clear rejection.
      const resume = withPad(
        "1 year of experience as a junior developer. Eager to grow and take on more responsibility."
      );
      const result = preFilterCandidate(
        resume,
        req({ min_years_experience: 8, seniority: "senior" })
      );

      expectRejection(result);
      expect(result.rejectionReason).toContain("1 year");
      expect(result.rejectionReason).toContain("8+");
      expect(result.confidence).toBe(0.9); // explicit "X years" pattern → 0.90
    });

    it("5b. '2+ years experience' against a 10-year minimum", () => {
      const resume = withPad(
        "2+ years experience building web applications. Passionate about technology."
      );
      const result = preFilterCandidate(
        resume,
        req({ min_years_experience: 10, seniority: "staff" })
      );

      expectRejection(result);
      expect(result.confidence).toBe(0.9);
    });
  });

  // ── SHOULD PASS THROUGH ───────────────────────────────────────────────────
  //
  // These cases either have no disqualifying signal, or the signal's confidence
  // is below 0.70, meaning the preFilter correctly defers the decision to AI.

  describe("SHOULD PASS THROUGH (passed=true)", () => {
    it("2. teacher resume — preFilter cannot detect job-type irrelevance", () => {
      // "10 years teaching" does NOT match the "X years of experience" pattern
      // (the pattern requires the word "experience" after "years").
      // preFilter is signal-based, not relevance-based; it punts this to AI.
      const resume = withPad(
        "10 years teaching high school mathematics and physics. Developed curriculum for algebra and calculus. Mentored students through academic challenges."
      );
      const result = preFilterCandidate(
        resume,
        req({ min_years_experience: 6, seniority: "senior" })
      );

      expect(result.passed).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      // No rejection reason when passing
      expect(result.rejectionReason).toBeUndefined();
    });

    it("4. bachelor degree resume when PhD required — degree check always defers to AI", () => {
      // checkDegree uses confidence=0.65, intentionally below the 0.70 threshold.
      // Candidates frequently omit their degree from resumes; auto-rejecting on
      // degree absence would create too many false positives.
      const resume = withPad(
        "Bachelor of Science in Computer Science. 3 years of experience in software development. Strong problem-solving skills."
      );
      const result = preFilterCandidate(
        resume,
        req({ degree: "phd", min_years_experience: 3, seniority: "senior" })
      );

      expect(result.passed).toBe(true);
      // Confidence is exactly 0.65 — the degree check's fixed confidence value,
      // signalling to downstream consumers that there IS a concern, just not
      // enough to auto-reject.
      expect(result.confidence).toBe(0.65);
      expect(result.rejectionReason).toBeUndefined();
    });

    it("6. resume with experience exactly at the required minimum", () => {
      const resume = withPad(
        "6 years of experience in backend engineering with Python, distributed systems, and Kafka."
      );
      const result = preFilterCandidate(
        resume,
        req({ min_years_experience: 6, seniority: "senior" })
      );

      expect(result.passed).toBe(true);
      expect(result.confidence).toBe(1); // all checks pass → final confidence is 1
    });

    it("7. senior candidate with ambiguous location phrasing (no exact remote-only keyword)", () => {
      // "Open to hybrid" and "flexible work" match none of:
      //   "remote only" | "will not relocate" | "remote preferred"
      // The preFilter correctly lets this through; the nuance belongs to a human.
      const resume = withPad(
        "10 years of experience in distributed systems. Open to hybrid or flexible work arrangements depending on the role."
      );
      const result = preFilterCandidate(
        resume,
        req({ location: "New York, NY", seniority: "senior", min_years_experience: 6 })
      );

      expect(result.passed).toBe(true);
      expect(result.confidence).toBe(1);
    });

    it("8. resume under 200 characters always passes with confidence=0, regardless of signals", () => {
      // Even a resume dense with reject-signals passes when < 200 chars:
      // too little text to make a reliable signal extraction.
      const shortResume = "1 year of experience. Class of 2024. Remote only. Will not relocate.";
      expect(shortResume.length, "precondition: must be < 200 chars").toBeLessThan(200);

      const result = preFilterCandidate(
        shortResume,
        req({ seniority: "senior", min_years_experience: 8, location: "NYC" })
      );

      expect(result.passed).toBe(true);
      expect(result.confidence).toBe(0); // sentinel: "no decision possible"
      expect(result.rejectionReason).toBeUndefined();
    });

    it("9. edge: exactly 5 years of experience satisfies a 5+ minimum (boundary condition)", () => {
      const resume = withPad(
        "5 years of experience building production web applications and RESTful APIs."
      );
      const result = preFilterCandidate(
        resume,
        req({ min_years_experience: 5, seniority: "mid" })
      );

      expect(result.passed).toBe(true);
    });

    it("10. remote-only signals on resume do NOT cause rejection when req has no location", () => {
      // checkRemoteOnly only fires when required.location is set.
      // A fully-remote req should never filter remote-only candidates.
      const resume = withPad(
        "Remote only. Will not relocate. 5 years of experience in frontend engineering."
      );
      const result = preFilterCandidate(
        resume,
        req({ min_years_experience: 3, seniority: "mid" }) // no location field
      );

      expect(result.passed).toBe(true);
      expect(result.confidence).toBe(1);
    });
  });

  // ── CONFIDENCE EDGE CASES ─────────────────────────────────────────────────

  describe("CONFIDENCE EDGE CASES", () => {
    it("11. single date range (confidence 0.60) passes through — below the 0.70 rejection threshold", () => {
      // A single date range produces confidence=0.60, which is below 0.70.
      // The preFilter defers this borderline case to AI.
      //
      // Signal math:
      //   Pattern 2: "2023 – 2024" → career span=1 year, rangesFound=1 → confidence=0.60
      //   Only one estimate → no boost → finalConfidence=0.60
      //   1 < 6 (min required) → failed=true, but 0.60 < 0.70 → passes through
      //
      // NOTE: "Graduated in YYYY" and "Class of YYYY" do NOT match the gradPattern
      // regex — alternatives 1 & 2 lack a `\s*` before the year capture group,
      // so only "graduation year: YYYY" / "graduation year YYYY" actually fire it.
      const resume = withPad(
        "Software Engineer at StartupCo 2023 – 2024. Built microservices and REST APIs for internal tooling."
      );
      const result = preFilterCandidate(
        resume,
        req({ min_years_experience: 6, seniority: "senior" })
      );

      expect(result.passed).toBe(true);
      expect(result.confidence).toBe(0.6);
      expect(result.rejectionReason).toBeUndefined();
    });

    it("12. two agreeing weak signals boost combined confidence to 0.70, crossing the rejection threshold", () => {
      // Signal A: date range "2021 – 2023" → career span=2 years, confidence=0.60
      //           (single range → 0.60; two or more ranges would give 0.75)
      // Signal B: "Graduation year: 2021" → yearsSinceGrad=5, years=4, confidence=0.55
      //           This IS the format the gradPattern matches. Plain "Graduated in YYYY"
      //           does NOT match because `graduated(?:\s+in)?` has no trailing `\s*`
      //           before the year capture group.
      //
      // Both agree within 3 years (|2 − 4| = 2 ≤ 3):
      //   agreeing.length=2 → boost: min(0.95, 0.60 + 0.10) = 0.70
      //   0.70 is NOT < 0.70 (strict threshold) → rejection fires.
      const resume = withPad(
        "Graduation year: 2021. Software Engineer at Acme Corp 2021 – 2023. Built REST APIs and distributed services."
      );
      const result = preFilterCandidate(
        resume,
        req({ min_years_experience: 6, seniority: "senior" })
      );

      expect(result.passed).toBe(false);
      expect(result.rejectionReason).toBeDefined();
      // 0.60 + 0.10 = 0.7000…001 in IEEE 754; toBeCloseTo handles float drift
      expect(result.confidence).toBeCloseTo(0.7, 5);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("two date ranges (2+ ranges) produce confidence 0.75, triggering rejection", () => {
      // Two ranges → confidence=0.75 (>= 0.70 threshold) for career span.
      // This verifies the 0.60 vs 0.75 branching in extractYearsOfExperience.
      const resume = withPad(
        "Software Engineer at Company A 2019 – 2021. Senior Engineer at Company B 2021 – 2023."
      );
      const result = preFilterCandidate(
        resume,
        req({ min_years_experience: 10, seniority: "senior" })
      );

      // careerSpan = 2023-2019 = 4 years, confidence = 0.75 (2+ ranges)
      // 4 < 10 → reject
      expect(result.passed).toBe(false);
      expect(result.confidence).toBe(0.75);
    });

    it("agreeing signals across patterns boost confidence above 0.90", () => {
      // Explicit mention (confidence 0.90) + agreeing date range → boost to 0.95 cap.
      const resume = withPad(
        "2 years of experience. Junior Developer at StartupCo 2023 – 2025."
      );
      const result = preFilterCandidate(
        resume,
        req({ min_years_experience: 8, seniority: "senior" })
      );

      expect(result.passed).toBe(false);
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  // ── CONTRACT INVARIANTS ───────────────────────────────────────────────────
  //
  // These property-based checks verify the PreFilterResult shape contract
  // holds across a variety of inputs, including adversarial ones.

  describe("PreFilterResult contract invariants", () => {
    const fixtures: Array<{
      label: string;
      resume: string;
      criteria: RequisitionCriteria;
    }> = [
      {
        label: "clearly qualified senior engineer",
        resume: withPad("10 years of experience in Python and distributed systems."),
        criteria: req({ min_years_experience: 6, seniority: "senior" }),
      },
      {
        label: "new-grad applying to senior role",
        resume: withPad("Class of 2024. Seeking entry level software engineering position."),
        criteria: req({ seniority: "senior", min_years_experience: 6 }),
      },
      {
        label: "resume with only garbage characters (just over 200 chars)",
        resume: "!@#$%^&*()".repeat(21),
        criteria: req({ min_years_experience: 5, seniority: "mid" }),
      },
      {
        label: "all rejection signals simultaneously",
        resume: withPad(
          "Class of 2024. Remote only. Will not relocate. Bachelor's degree. 1 year of experience."
        ),
        criteria: req({
          seniority: "staff",
          min_years_experience: 8,
          location: "Austin, TX",
          degree: "phd",
        }),
      },
      {
        label: "exactly at 200-character boundary",
        resume: "a".repeat(200),
        criteria: req({ min_years_experience: 5 }),
      },
    ];

    for (const { label, resume, criteria } of fixtures) {
      it(`[${label}]: confidence ∈ [0,1] and rejectionReason ↔ passed=false`, () => {
        const result = preFilterCandidate(resume, criteria);

        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);

        if (!result.passed) {
          // Every rejection must explain itself and must be high-confidence
          expect(result.rejectionReason).toBeDefined();
          expect(result.rejectionReason!.length).toBeGreaterThan(0);
          expect(result.confidence).toBeGreaterThanOrEqual(0.7);
        } else {
          // A passing result must not have a rejection reason
          expect(result.rejectionReason).toBeUndefined();
        }
      });
    }
  });
});
