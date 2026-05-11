import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ParsedResume } from "./resumeParser";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TriageResult {
  tier: "auto_reject" | "review" | "strong" | "top";
  matched: string[];
  missing: string[];
  preferred_hits: string[];
  confidence: number;
  summary: string;
}

interface TriageReqCriteria {
  required: Record<string, unknown>;
  preferred: string[];
  dealbreakers: string[];
}

// ── Model (lazy singleton) ────────────────────────────────────────────────────
// Lazy init avoids crashing at build time when env vars are absent.

let _client: GoogleGenerativeAI | null = null;

function getModel() {
  if (!_client) {
    if (!process.env.GEMINI_API_KEY) {
      console.error("[gemini] GEMINI_API_KEY is not set — all triage calls will fall back");
    }
    _client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  }
  return _client.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      // Forces the API to emit bare JSON — eliminates markdown fence stripping
      responseMimeType: "application/json",
      temperature: 0.1, // low variance for consistent structured output
    },
  });
}

// ── Cache ─────────────────────────────────────────────────────────────────────

const responseCache = new Map<string, TriageResult>();

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(33, h) ^ s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function buildCacheKey(rawText: string, reqTitle: string): string {
  return `${djb2(rawText.slice(0, 150))}:${reqTitle}`;
}

// ── Fallback ──────────────────────────────────────────────────────────────────

const FALLBACK: TriageResult = {
  tier: "review",
  matched: [],
  missing: [],
  preferred_hits: [],
  confidence: 0,
  summary: "Could not process — please review manually",
};

// ── Prompt ────────────────────────────────────────────────────────────────────

function sanitizeResumeText(text: string): string {
  // Defense-in-depth: raw_text is already PII-stripped by resumeParser;
  // this pass catches any remaining prompt-injection patterns.
  return text
    .replace(
      /\b(?:ignore|disregard|forget|bypass)\s+(?:the\s+)?(?:previous|prior|above|all|these?|your)?\s*(?:instructions?|prompt|context|rules?)\b/gi,
      "[REDACTED]"
    )
    .replace(/\byou\s+are\s+now\b|\bact\s+as\b|\bpretend\s+(?:to\s+be|you\s+are)\b/gi, "[REDACTED]")
    .replace(/\brate\s+this\s+candidate\s+as\s+[^.!?\n]+/gi, "[REDACTED]")
    .replace(/^system\s*:/gim, "[REDACTED]:")
    .slice(0, 8000);
}

function buildPrompt(
  parsed: ParsedResume,
  criteria: TriageReqCriteria,
  reqTitle: string
): string {
  // Send structured fields separately from raw text so Gemini can weight them
  // correctly — explicit data > inferred data.
  const structuredData = {
    years_of_experience: parsed.years_of_experience,
    most_recent_title: parsed.most_recent_title,
    most_recent_company: parsed.most_recent_company,
    education: parsed.education,
    skills: parsed.skills,
    total_jobs: parsed.total_jobs,
    avg_tenure_months: parsed.avg_tenure_months,
    employment_gaps: parsed.employment_gaps,
  };

  const dealbreakersBlock =
    criteria.dealbreakers.length > 0
      ? criteria.dealbreakers.map((d) => `  - ${d}`).join("\n")
      : "  (none)";

  const preferredBlock =
    criteria.preferred.length > 0
      ? criteria.preferred.join(", ")
      : "(none)";

  return `You are an expert technical recruiter evaluating a candidate for: ${reqTitle}

REQUIRED CRITERIA:
${JSON.stringify(criteria.required, null, 2)}

PREFERRED SKILLS:
${preferredBlock}

DEALBREAKERS — presence of any of these means auto_reject:
${dealbreakersBlock}

CANDIDATE STRUCTURED DATA (pre-parsed, PII redacted):
${JSON.stringify(structuredData, null, 2)}

CANDIDATE RESUME TEXT (PII redacted):
${sanitizeResumeText(parsed.raw_text)}

Return ONLY valid JSON — no markdown, no preamble, no trailing text:
{
  "tier": "top" | "strong" | "review" | "auto_reject",
  "matched": ["each required criterion clearly evidenced in this resume"],
  "missing": ["each required criterion that is absent or ambiguous"],
  "preferred_hits": ["each preferred skill found in this resume"],
  "confidence": <0.0–1.0 — your certainty that this tier placement is correct>,
  "summary": "<recruiter-facing sentence, 20 words max>"
}

Tier definitions:
  top         → exceeds all required criteria; standout candidate
  strong      → meets all required criteria; no meaningful gaps
  review      → partially meets criteria; human review warranted
  auto_reject → a dealbreaker is clearly present, or critical criteria unmet

When the resume provides insufficient signal to be certain, prefer the more conservative tier and lower your confidence score accordingly.`;
}

// ── Override Rules ────────────────────────────────────────────────────────────

function applyOverrides(
  result: TriageResult,
  criteria: TriageReqCriteria,
  rawText: string
): TriageResult {
  let tier = result.tier;

  // Rule 1 — dealbreaker match: check Gemini's assessment and keyword scan
  // as a safety net in case Gemini missed an explicit dealbreaker mention.
  const lowerText = rawText.toLowerCase();
  const lowerMissing = result.missing.map((m) => m.toLowerCase());

  const dealbreakersHit =
    tier === "auto_reject" || // Gemini already decided
    criteria.dealbreakers.some((db) => {
      const ldb = db.toLowerCase();
      return lowerText.includes(ldb) || lowerMissing.some((m) => m.includes(ldb));
    });

  if (dealbreakersHit) {
    // Dealbreaker overrides everything, including low-confidence guard below.
    return { ...result, tier: "auto_reject" };
  }

  // Rule 2 — too many missing required criteria: cap at review
  if (result.missing.length >= 2 && (tier === "strong" || tier === "top")) {
    tier = "review";
  }

  // Rule 3 — low confidence: demote to review (never demote auto_reject)
  if (result.confidence < 0.65) {
    tier = "review";
  }

  return { ...result, tier };
}

// ── Response Validation ───────────────────────────────────────────────────────

const VALID_TIERS = new Set(["auto_reject", "review", "strong", "top"]);

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string" && item.trim().length > 0)
  );
}

function isValidTriageResult(v: unknown): v is TriageResult {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    VALID_TIERS.has(r.tier as string) &&
    isStringArray(r.matched) &&
    isStringArray(r.missing) &&
    isStringArray(r.preferred_hits) &&
    typeof r.confidence === "number" &&
    r.confidence >= 0 &&
    r.confidence <= 1 &&
    typeof r.summary === "string"
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────

const GEMINI_TIMEOUT_MS = 10_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs = GEMINI_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Gemini timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function triageCandidate(
  parsedResume: ParsedResume,
  reqCriteria: object,
  reqTitle: string
): Promise<TriageResult> {
  const key = buildCacheKey(parsedResume.raw_text, reqTitle);
  const cached = responseCache.get(key);
  if (cached) return cached;

  const criteria = reqCriteria as TriageReqCriteria;

  try {
    console.log(`[gemini] Calling Gemini for req="${reqTitle}" textLen=${parsedResume.raw_text.length}`);
    const prompt = buildPrompt(parsedResume, criteria, reqTitle);
    const response = await withTimeout(getModel().generateContent(prompt));
    const text = response.response
      .text()
      .replace(/^```(?:json)?|```$/gm, "") // strip fences in case mime type is ignored
      .trim();

    const parsed: unknown = JSON.parse(text);

    if (!isValidTriageResult(parsed)) {
      console.warn("[gemini] Response failed validation — using FALLBACK:", text.slice(0, 200));
      return FALLBACK;
    }

    const final = applyOverrides(parsed, criteria, parsedResume.raw_text);
    responseCache.set(key, final);
    return final;
  } catch (err) {
    console.error("[gemini] Error during triage:", err instanceof Error ? err.message : err);
    return FALLBACK;
  }
}
