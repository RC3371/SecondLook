export interface RequisitionCriteria {
  required: {
    min_years_experience: number;
    degree?: string;
    location?: string;
    seniority: "junior" | "mid" | "senior" | "staff";
  };
  dealbreakers: string[];
}

export interface PreFilterResult {
  passed: boolean;
  rejectionReason?: string;
  confidence: number;
}

const CURRENT_YEAR = new Date().getFullYear();

const NEW_GRAD_KEYWORDS = [
  "seeking entry level",
  "recent graduate",
  "class of 202",
  "b.s. expected",
  "internship experience only",
];

const REMOTE_ONLY_KEYWORDS = [
  "remote only",
  "will not relocate",
  "remote preferred",
];

// Maps normalized degree names to hierarchy levels (0=none, 4=phd)
const DEGREE_PATTERNS: Array<{ pattern: RegExp; level: number }> = [
  { pattern: /\b(?:ph\.?d|doctorate|doctoral)\b/i, level: 4 },
  { pattern: /\b(?:master(?:s|'s)?|m\.s\.|m\.a\.|m\.eng|mba|m\.tech)\b/i, level: 3 },
  { pattern: /\b(?:bachelor(?:s|'s)?|b\.s\.|b\.a\.|b\.eng|b\.tech|undergraduate)\b/i, level: 2 },
  { pattern: /\b(?:associate(?:s|'s)?|a\.s\.|a\.a\.)\b/i, level: 1 },
];

const REQUIRED_DEGREE_LEVELS: Record<string, number> = {
  phd: 4,
  doctorate: 4,
  masters: 3,
  master: 3,
  ms: 3,
  mba: 3,
  bachelors: 2,
  bachelor: 2,
  bs: 2,
  ba: 2,
  undergraduate: 2,
  associates: 1,
  associate: 1,
};

function getHighestDegreeInResume(text: string): number {
  for (const { pattern, level } of DEGREE_PATTERNS) {
    if (pattern.test(text)) return level;
  }
  return 0;
}

function normalizeDegreeRequirement(degree: string): number {
  const key = degree.toLowerCase().replace(/[.']/g, "").trim();
  return REQUIRED_DEGREE_LEVELS[key] ?? 2; // default to bachelor-level if unrecognized
}

interface YearsEstimate {
  years: number;
  confidence: number;
}

function extractYearsOfExperience(text: string): YearsEstimate | null {
  const estimates: Array<{ years: number; confidence: number }> = [];

  // Pattern 1: Explicit "X years of experience" / "X+ years experience"
  const explicitPattern = /(\d+)\+?\s*years?\s+(?:of\s+)?(?:experience|exp\.?)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = explicitPattern.exec(text)) !== null) {
    const years = parseInt(match[1], 10);
    if (years >= 0 && years <= 60) {
      estimates.push({ years, confidence: 0.9 });
    }
  }

  // Pattern 2: Career span from date ranges ("2018 – 2022", "Jan 2019 - Present")
  const dateRangePattern =
    /\b(20\d{2}|19[6-9]\d)\s*[-–—]\s*(20\d{2}|19[6-9]\d|present|current|now)\b/gi;
  let earliestStart = Infinity;
  let latestEnd = 0;
  let rangesFound = 0;

  while ((match = dateRangePattern.exec(text)) !== null) {
    const startYear = parseInt(match[1], 10);
    const endToken = match[2].toLowerCase();
    const endYear = ["present", "current", "now"].includes(endToken)
      ? CURRENT_YEAR
      : parseInt(match[2], 10);

    const span = endYear - startYear;
    if (span >= 0 && span <= 50) {
      if (startYear < earliestStart) earliestStart = startYear;
      if (endYear > latestEnd) latestEnd = endYear;
      rangesFound++;
    }
  }

  if (rangesFound > 0) {
    const careerSpan = latestEnd - earliestStart;
    // Career span is an upper bound; confidence is moderate since we can't
    // account for gaps or edu overlap without deeper parsing
    estimates.push({ years: careerSpan, confidence: rangesFound >= 2 ? 0.75 : 0.6 });
  }

  // Pattern 3: Graduation year -> years since graduation as experience proxy
  const gradPattern =
    /(?:class\s+of|graduated(?:\s+in)?|graduation\s+(?:year|date)?:?\s*)(20\d{2}|19[6-9]\d)\b/gi;
  while ((match = gradPattern.exec(text)) !== null) {
    const gradYear = parseInt(match[1], 10);
    const yearsSinceGrad = CURRENT_YEAR - gradYear;
    if (yearsSinceGrad >= 0 && yearsSinceGrad <= 50) {
      // Graduation year is a weak lower bound on experience; it could include school years
      estimates.push({ years: Math.max(0, yearsSinceGrad - 1), confidence: 0.55 });
    }
  }

  if (estimates.length === 0) return null;

  // Use the most confident estimate; break ties by taking the highest year count
  // (erring toward passing rather than false-rejecting)
  estimates.sort((a, b) => b.confidence - a.confidence || b.years - a.years);
  const best = estimates[0];

  // Boost confidence slightly when multiple independent signals agree within 3 years
  const agreeing = estimates.filter((e) => Math.abs(e.years - best.years) <= 3);
  const finalConfidence =
    agreeing.length >= 2 ? Math.min(0.95, best.confidence + 0.1) : best.confidence;

  return { years: best.years, confidence: finalConfidence };
}

function checkMinExperience(
  text: string,
  minYears: number
): { failed: boolean; reason: string; confidence: number } {
  if (minYears <= 0) return { failed: false, reason: "", confidence: 1 };

  const estimate = extractYearsOfExperience(text);
  if (!estimate) {
    // No signal — cannot reject
    return { failed: false, reason: "", confidence: 0 };
  }

  if (estimate.years < minYears) {
    return {
      failed: true,
      reason: `Resume indicates ~${estimate.years} year(s) of experience; role requires ${minYears}+`,
      confidence: estimate.confidence,
    };
  }

  return { failed: false, reason: "", confidence: estimate.confidence };
}

function checkSeniority(
  text: string,
  required: RequisitionCriteria["required"]
): { failed: boolean; reason: string; confidence: number } {
  const lower = text.toLowerCase();
  const matchedKeyword = NEW_GRAD_KEYWORDS.find((kw) => lower.includes(kw));
  if (!matchedKeyword) return { failed: false, reason: "", confidence: 1 };

  const seniority = required.seniority;

  // Entry-level signals are fine for junior roles
  if (seniority === "junior") return { failed: false, reason: "", confidence: 1 };

  const confidence = seniority === "staff" ? 0.85 : seniority === "senior" ? 0.8 : 0.75;
  return {
    failed: true,
    reason: `Resume contains new-grad signal ("${matchedKeyword}") but role requires ${seniority}-level candidate`,
    confidence,
  };
}

function checkRemoteOnly(
  text: string,
  location: string | undefined
): { failed: boolean; reason: string; confidence: number } {
  // Only applies when the role specifies a location (i.e., is not fully remote)
  if (!location) return { failed: false, reason: "", confidence: 1 };

  const lower = text.toLowerCase();
  const matchedKeyword = REMOTE_ONLY_KEYWORDS.find((kw) => lower.includes(kw));
  if (!matchedKeyword) return { failed: false, reason: "", confidence: 1 };

  return {
    failed: true,
    reason: `Candidate indicates remote-only preference ("${matchedKeyword}") but role is onsite in ${location}`,
    confidence: 0.8,
  };
}

function checkDegree(
  text: string,
  requiredDegree: string | undefined
): { failed: boolean; reason: string; confidence: number } {
  if (!requiredDegree) return { failed: false, reason: "", confidence: 1 };

  const requiredLevel = normalizeDegreeRequirement(requiredDegree);
  const resumeLevel = getHighestDegreeInResume(text);

  if (resumeLevel >= requiredLevel) return { failed: false, reason: "", confidence: 1 };

  // Degree absence is medium-confidence: candidates sometimes omit education sections
  return {
    failed: true,
    reason: `Role requires a ${requiredDegree} degree but no matching degree found in resume`,
    confidence: 0.65,
  };
}

const CONFIDENCE_THRESHOLD = 0.7;
const MIN_RESUME_LENGTH = 200;

export function preFilterCandidate(
  resumeText: string,
  reqCriteria: RequisitionCriteria
): PreFilterResult {
  // Not enough signal to make any pre-filter decision
  if (resumeText.length < MIN_RESUME_LENGTH) {
    return { passed: true, confidence: 0 };
  }

  const { required } = reqCriteria;

  const checks = [
    checkMinExperience(resumeText, required.min_years_experience),
    checkSeniority(resumeText, required),
    checkRemoteOnly(resumeText, required.location),
    checkDegree(resumeText, required.degree),
  ];

  for (const check of checks) {
    if (!check.failed) continue;

    // Low-confidence rejection defers to AI rather than risking a false reject
    if (check.confidence < CONFIDENCE_THRESHOLD) {
      return { passed: true, confidence: check.confidence };
    }

    return {
      passed: false,
      rejectionReason: check.reason,
      confidence: check.confidence,
    };
  }

  return { passed: true, confidence: 1 };
}
