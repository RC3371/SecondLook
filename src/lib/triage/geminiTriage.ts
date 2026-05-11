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
  review      → genuinely ambiguous: notable strengths AND meaningful gaps exist simultaneously
  auto_reject → a dealbreaker is present, or so many critical criteria are unmet that rejection is clear

Assignment rules:
- Commit to the most defensible tier given the available evidence.
- Use 'review' ONLY when the candidate clearly has both strengths worth noting AND real gaps — not simply because signal is limited.
- If the resume is thin but shows no red flags, default to 'strong' or 'review' rather than 'auto_reject'.
- If the candidate is clearly unqualified, use 'auto_reject' — do not soften to 'review'.
- Express uncertainty via a lower confidence score, not by picking a more conservative tier.`;
}

// ── Override Rules ────────────────────────────────────────────────────────────

function applyOverrides(
  result: TriageResult,
  criteria: TriageReqCriteria,
  rawText: string
): TriageResult {
  let tier = result.tier;
  let summary = result.summary;

  // Rule 1 — dealbreaker safety net: keyword scan in case Gemini missed one.
  // Only fires on whole-word matches to reduce false positives.
  const lowerText = rawText.toLowerCase();

  const hitDealbreaker = criteria.dealbreakers.find((db) => {
    const ldb = db.toLowerCase();
    const re = new RegExp(`\\b${ldb.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    return re.test(lowerText);
  });

  if (tier === "auto_reject" || hitDealbreaker) {
    const reason = hitDealbreaker ? `Dealbreaker matched: "${hitDealbreaker}"` : summary;
    return { ...result, tier: "auto_reject", summary: reason };
  }

  // Rule 2 — 3+ missing required criteria when Gemini graded top/strong:
  // demote to auto_reject rather than review since they clearly don't qualify.
  if (result.missing.length >= 3 && (tier === "strong" || tier === "top")) {
    const listed = result.missing.slice(0, 3).join("; ");
    return {
      ...result,
      tier: "auto_reject",
      summary: `Missing ${result.missing.length} required criteria: ${listed}`,
    };
  }

  // Rule 3 — 2 missing required criteria: cap at review, not auto_reject.
  if (result.missing.length === 2 && (tier === "strong" || tier === "top")) {
    tier = "review";
    summary = `Missing 2 required criteria: ${result.missing.join("; ")}`;
  }

  // Rule 4 — very low confidence (< 0.4): Gemini was highly uncertain, defer to human.
  // Threshold intentionally low so Gemini's tier is trusted in most cases.
  if (result.confidence < 0.4) {
    tier = "review";
    summary = `Low confidence (${Math.round(result.confidence * 100)}%) — ${summary}`;
  }

  return { ...result, tier, summary };
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
