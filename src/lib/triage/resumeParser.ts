export interface ParsedResume {
  years_of_experience: number | null;
  most_recent_title: string | null;
  most_recent_company: string | null;
  education: {
    degree: string | null;
    field: string | null;
    institution: string | null;
  };
  skills: string[];
  employment_gaps: boolean;
  total_jobs: number;
  avg_tenure_months: number | null;
  raw_text: string;
}

export interface RiskSignals {
  keyword_stuffing: boolean;
  possible_ai_generated: boolean;
  prompt_injection: boolean;
  suspiciously_short: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};

const US_STATES =
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";

const PROMPT_INJECTION_SANITIZE_RE =
  /\b(?:ignore|disregard|forget|bypass|override)\b[\s\S]{0,80}?\b(?:instructions?|prompt|context|rules?|directions?|guidelines?)\b|\byou\s+are\s+now\b|\bact\s+as\b|\bpretend\s+(?:to\s+be|you\s+are)\b|^system\s*:\s*|<!--[\s\S]*?inject[\s\S]*?-->/gim;

// ── PII Stripping ─────────────────────────────────────────────────────────────

function stripPII(text: string): string {
  const piiStripped =
    text
      // Remove null bytes that can break downstream parsing/prompt construction.
      .replace(/\x00/g, "")
      // Emails
      .replace(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, "[EMAIL]")
      // Phone numbers: (555) 123-4567 | 555-123-4567 | 555.123.4567 | +1 555 123 4567
      .replace(
        /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
        "[PHONE]"
      )
      // 10-digit bare number (not preceded/followed by digit to avoid false matches)
      .replace(/(?<!\d)\d{10}(?!\d)/g, "[PHONE]")
      // LinkedIn profile URLs
      .replace(
        /https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\s,)\]>]*/gi,
        "[LINKEDIN]"
      )
      // GitHub profile URLs
      .replace(
        /https?:\/\/(?:www\.)?github\.com\/[^\s,)\]>]*/gi,
        "[GITHUB]"
      )
      // All remaining http(s) URLs
      .replace(/https?:\/\/[^\s,)\]>]*/gi, "[URL]")
      // Bare www. URLs
      .replace(/\bwww\.[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}[^\s,)>\]']*/gi, "[URL]")
      // Street addresses: "123 Oak Avenue", "456 Main St Apt 2B"
      .replace(
        /\b\d+\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Place|Pl|Highway|Hwy|Parkway|Pkwy|Circle|Cir|Trail|Trl)\b\.?(?:\s*,?\s*(?:Apt|Suite|Ste|Unit|#)\s*\w+)?/gi,
        "[ADDRESS]"
      )
      // City, State ZIP (only fires on known US state abbreviations to avoid false positives)
      .replace(
        new RegExp(
          `[A-Z][a-zA-Z]+(?:\\s+[A-Z][a-zA-Z]+)*,\\s*(?:${US_STATES})(?:\\s+\\d{5}(?:-\\d{4})?)?\\b`,
          "g"
        ),
        "[LOCATION]"
      );

  return piiStripped.replace(PROMPT_INJECTION_SANITIZE_RE, "[REDACTED]");
}

// ── Date Range Parsing ────────────────────────────────────────────────────────

const MO =
  "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
const YR = "20\\d{2}|19[6-9]\\d";
// Capture groups: 1=startMonth, 2=startYear, 3=endMonth, 4=endToken
const DATE_RANGE_SRC = `(?:(${MO})\\.?\\s+)?(${YR})\\s*[-–—]\\s*(?:(${MO})\\.?\\s+)?(${YR}|[Pp]resent|[Cc]urrent|[Nn]ow)`;
const DATE_RANGE_RE = new RegExp(DATE_RANGE_SRC, "i");
const DATE_RANGE_RE_G = new RegExp(DATE_RANGE_SRC, "gi");

interface DatePoint {
  year: number;
  month: number;
}
interface DateRange {
  start: DatePoint;
  end: DatePoint;
  isCurrent: boolean;
}
interface WorkEntry extends DateRange {
  durationMonths: number;
  title: string | null;
  company: string | null;
}

function parseDateMatch(m: RegExpMatchArray): DateRange | null {
  const startMonthRaw = m[1]?.toLowerCase().slice(0, 3);
  const startYear = parseInt(m[2], 10);
  const endMonthRaw = m[3]?.toLowerCase().slice(0, 3);
  const endToken = m[4].toLowerCase();

  if (startYear < 1960 || startYear > CURRENT_YEAR + 1) return null;

  const isCurrent = ["present", "current", "now"].includes(endToken);
  const endYear = isCurrent ? CURRENT_YEAR : parseInt(m[4], 10);

  if (!isCurrent && (endYear < 1960 || endYear > CURRENT_YEAR + 1)) return null;
  if (endYear < startYear) return null;

  const start: DatePoint = {
    year: startYear,
    month: MONTH_NAMES[startMonthRaw ?? ""] ?? 1,
  };
  const end: DatePoint = {
    year: endYear,
    month: isCurrent ? CURRENT_MONTH : (MONTH_NAMES[endMonthRaw ?? ""] ?? 12),
  };
  return { start, end, isCurrent };
}

function durationMonths(start: DatePoint, end: DatePoint): number {
  return Math.max(0, (end.year - start.year) * 12 + (end.month - start.month));
}

// ── Work History ──────────────────────────────────────────────────────────────

const TITLE_RE =
  /\b(?:engineer|developer|manager|director|analyst|designer|architect|scientist|consultant|specialist|coordinator|administrator|lead|head|vp|vice\s+president|cto|ceo|cfo|coo|officer|intern|associate|senior|junior|principal|staff|founder|researcher|programmer|contractor|technician|strategist)\b/i;

const BULLET_RE = /^[\s]*[-•*◦‣▸▪]\s+|^\s*\d+[.)]\s+/;

function isBulletLine(line: string): boolean {
  return BULLET_RE.test(line);
}

function classifyTitleCompany(
  a: string,
  b: string | null
): { title: string | null; company: string | null } {
  if (!b) {
    return TITLE_RE.test(a)
      ? { title: a, company: null }
      : { title: null, company: a };
  }
  const aIsTitle = TITLE_RE.test(a);
  const bIsTitle = TITLE_RE.test(b);
  if (aIsTitle && !bIsTitle) return { title: a, company: b };
  if (bIsTitle && !aIsTitle) return { title: b, company: a };
  // Both or neither contain title keywords — trust line order (title usually first)
  return { title: a, company: b };
}

function parseWorkHistory(lines: string[]): WorkEntry[] {
  const entries: WorkEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const rangeMatch = trimmed.match(DATE_RANGE_RE);
    if (!rangeMatch) continue;

    const range = parseDateMatch(rangeMatch);
    if (!range) continue;

    let title: string | null = null;
    let company: string | null = null;

    // Check for inline format before the date: "Title | Company | 2020 – 2023"
    const beforeDate = trimmed.slice(0, rangeMatch.index ?? 0).trim();
    if (beforeDate.length > 0) {
      const parts = beforeDate
        .split(/\s*[|·•]\s*/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length >= 2) {
        ({ title, company } = classifyTitleCompany(parts[0], parts[1]));
      } else if (parts.length === 1) {
        ({ title, company } = classifyTitleCompany(parts[0], null));
      }
    }

    // Fall back to preceding context lines
    if (!title && !company) {
      const ctx: string[] = [];
      for (let j = Math.max(0, i - 3); j < i; j++) {
        const cl = lines[j].trim();
        if (cl.length < 2 || isBulletLine(cl) || DATE_RANGE_RE.test(cl)) continue;
        ctx.push(cl);
      }

      if (ctx.length >= 2) {
        // Inline separator on last context line?
        const last = ctx[ctx.length - 1];
        const parts = last
          .split(/\s*[|·•]\s*/)
          .map((p) => p.trim())
          .filter(Boolean);
        if (parts.length >= 2) {
          ({ title, company } = classifyTitleCompany(parts[0], parts[1]));
        } else {
          ({ title, company } = classifyTitleCompany(last, ctx[ctx.length - 2]));
        }
      } else if (ctx.length === 1) {
        ({ title, company } = classifyTitleCompany(ctx[0], null));
      }
    }

    entries.push({
      ...range,
      durationMonths: durationMonths(range.start, range.end),
      title,
      company,
    });
  }

  return entries;
}

// ── Education ─────────────────────────────────────────────────────────────────

const DEGREE_RE =
  /\b(Ph\.?D\.?|Doctorate?|Doctor\s+of\s+[A-Za-z\s]{1,30}|M\.?S\.?|M\.?A\.?|MBA|M\.?Eng\.?|M\.?Tech\.?|Master(?:'?s)?(?:\s+of\s+[A-Za-z\s]{1,30})?|B\.?S\.?|B\.?A\.?|B\.?Eng\.?|B\.?Tech\.?|Bachelor(?:'?s)?(?:\s+of\s+[A-Za-z\s]{1,30})?|Associate(?:'?s)?(?:\s+of\s+[A-Za-z\s]{1,20})?)\b/i;

const FIELD_RE =
  /\bin\s+([A-Z][a-zA-Z\s&]{2,40}?)(?:\s*[,\n(]|\s{2,}|\s+from\b|\s+at\b)/i;

const INSTITUTION_RE =
  /\b(?:[A-Z][a-zA-Z'\-]+\s+){0,4}(?:University|College|Institute(?:\s+of\s+Technology)?|School\s+of\s+[A-Z][a-zA-Z\s]{1,30}|Academy)\b|University\s+of\s+(?:[A-Z][a-zA-Z'\-]+\s*)+/g;

const EDU_SECTION_RE =
  /^(?:EDUCATION|ACADEMIC\s+BACKGROUND|QUALIFICATIONS?)[:\s\-_=]*$/im;

function extractEducation(
  text: string
): ParsedResume["education"] {
  // Prefer searching inside an education section
  const sectionMatch = EDU_SECTION_RE.exec(text);
  const searchIn = sectionMatch
    ? text.slice(sectionMatch.index, sectionMatch.index + 800)
    : text.slice(0, 1200); // degrees appear early in most resumes

  const degreeMatch = searchIn.match(DEGREE_RE);
  const fieldMatch = searchIn.match(FIELD_RE);
  const institutionMatches = [...searchIn.matchAll(INSTITUTION_RE)];

  const degree = degreeMatch ? degreeMatch[1].trim() : null;
  const field = fieldMatch ? fieldMatch[1].trim() : null;
  const institution =
    institutionMatches.length > 0 ? institutionMatches[0][0].trim() : null;

  return { degree, field, institution };
}

// ── Skills ────────────────────────────────────────────────────────────────────

const SKILLS_SECTION_RE =
  /^(?:(?:technical\s+)?skills?|technologies|tech(?:nology)?\s+stack|tools?(?:\s+&\s+technologies)?|core\s+competencies|expertise|languages?\s+&\s+(?:frameworks?|tools?)|proficiencies)[:\s\-_=]*$/im;

// Fallback: well-known keywords to scan for when no skills section exists
const KNOWN_SKILLS = [
  "Python","JavaScript","TypeScript","Java","Go","Rust","C++","C#","Ruby","PHP",
  "Swift","Kotlin","Scala","R","SQL","Bash","Shell",
  "React","Angular","Vue","Next.js","Svelte","Django","FastAPI","Flask","Spring",
  "Express","Node.js","Rails",".NET","Laravel",
  "PostgreSQL","MySQL","MongoDB","Redis","Elasticsearch","DynamoDB","Cassandra",
  "Snowflake","BigQuery","SQLite","Supabase",
  "AWS","GCP","Azure","Docker","Kubernetes","Terraform","Ansible","Jenkins",
  "GitHub Actions","CI/CD","Helm",
  "TensorFlow","PyTorch","scikit-learn","Pandas","NumPy","Spark","Airflow","dbt",
  "Tableau","Power BI","Looker",
  "Git","Linux","GraphQL","REST","gRPC","Kafka","RabbitMQ","Celery","WebSockets",
];

function extractSkills(text: string): string[] {
  const sectionMatch = SKILLS_SECTION_RE.exec(text);

  if (sectionMatch) {
    const start = sectionMatch.index + sectionMatch[0].length;
    const sectionText = text.slice(start, start + 600);
    // End at next section-like header (line of 3+ consecutive CAPS or known section words)
    const nextHeaderIdx = sectionText.search(
      /^(?:[A-Z][A-Z\s&'\/]{4,})[:\s]*$|^(?:EXPERIENCE|EDUCATION|PROJECTS?|AWARDS?|PUBLICATIONS?|CERTIFICATIONS?)/m
    );
    const relevant = sectionText.slice(0, nextHeaderIdx === -1 ? 600 : nextHeaderIdx);

    const items = relevant
      .split(/[,;\n|•\-–]/)
      .map((s) => s.replace(/^[\s*▪◦▸]+/, "").trim())
      .filter((s) => {
        const words = s.split(/\s+/).length;
        return s.length >= 1 && words <= 5 && s.length <= 40;
      });

    const unique = [...new Set(items.filter(Boolean))];
    if (unique.length > 0) return unique;
  }

  // Fallback: scan for known skills
  const found: string[] = [];
  for (const skill of KNOWN_SKILLS) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(text)) {
      found.push(skill);
    }
  }
  return found;
}

// ── Employment Gaps ───────────────────────────────────────────────────────────

const GAP_THRESHOLD_MONTHS = 6;

function detectEmploymentGaps(entries: WorkEntry[]): boolean {
  if (entries.length < 2) return false;

  // Sort by start date ascending
  const sorted = [...entries].sort(
    (a, b) => a.start.year * 12 + a.start.month - (b.start.year * 12 + b.start.month)
  );

  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = sorted[i - 1].end;
    const currStart = sorted[i].start;
    const gap = (currStart.year - prevEnd.year) * 12 + (currStart.month - prevEnd.month);
    if (gap > GAP_THRESHOLD_MONTHS) return true;
  }
  return false;
}

// ── Risk Signals ──────────────────────────────────────────────────────────────

const BUZZWORDS = [
  "leveraged","spearheaded","orchestrated","synergized","optimized","streamlined",
  "facilitated","pioneered","revolutionized","transformed","accelerated","championed",
  "cultivated","harnessed","ideated","incubated","strategized","evangelized",
  "operationalized","socialized",
];

const PROMPT_INJECTION_RE =
  /\b(?:ignore|disregard|forget|bypass|override)\s+(?:the\s+)?(?:previous|prior|above|all|these?|your)?\s*(?:instructions?|prompt|context|rules?|directions?|guidelines?)\b|(?:\byou\s+are\s+now\b|\bact\s+as\b|\bpretend\s+(?:to\s+be|you\s+are)\b|\byour\s+new\s+(?:role|task|instructions?)\b)|^system\s*:/im;

const GENERIC_ACTION_VERBS = [
  "developed","implemented","managed","created","built","designed","led","worked",
  "utilized","used","helped","supported","assisted","maintained","handled",
];

function detectRiskSignals(
  sourceText: string,
  sanitizedText: string,
  skills: string[],
  wordCount: number
): RiskSignals {
  const lower = sanitizedText.toLowerCase();

  // Prompt injection: instruction-hijacking patterns
  const prompt_injection = PROMPT_INJECTION_RE.test(sourceText);

  // Keyword stuffing: skills section bloated with minimal prose
  const keyword_stuffing = skills.length > 25;

  // AI-generated heuristic: buzzword density + repetitive generic starters
  const buzzwordCount = BUZZWORDS.reduce(
    (n, w) => n + (lower.split(w).length - 1),
    0
  );
  const buzzwordDensity = wordCount > 0 ? (buzzwordCount / wordCount) * 100 : 0;

  const bulletLines = sanitizedText
    .split(/\r?\n/)
    .filter((l) => BULLET_RE.test(l));
  const genericStartCount = bulletLines.filter((l) =>
    GENERIC_ACTION_VERBS.some((v) =>
      l.trim().toLowerCase().startsWith(v)
    )
  ).length;
  const genericStartRatio =
    bulletLines.length > 4 ? genericStartCount / bulletLines.length : 0;

  const possible_ai_generated =
    buzzwordDensity > 3.5 || genericStartRatio > 0.55;

  // Suspiciously short (under 300 words regardless of claimed seniority)
  const suspiciously_short = wordCount < 300;

  return {
    keyword_stuffing,
    possible_ai_generated,
    prompt_injection,
    suspiciously_short,
  };
}

// ── Main Export ───────────────────────────────────────────────────────────────

export function parseResume(
  rawText: string
): { parsed: ParsedResume; risks: RiskSignals } {
  const raw_text = stripPII(rawText);
  const lines = raw_text.split(/\r?\n/);
  const wordCount = raw_text.split(/\s+/).filter(Boolean).length;

  // Work history
  const workEntries = parseWorkHistory(lines);
  const total_jobs = workEntries.length;

  // Sort descending by recency to identify the most recent role
  const byRecency = [...workEntries].sort(
    (a, b) =>
      b.end.year * 12 + b.end.month - (a.end.year * 12 + a.end.month)
  );
  const mostRecent = byRecency[0] ?? null;
  const most_recent_title = mostRecent?.title ?? null;
  const most_recent_company = mostRecent?.company ?? null;

  // Years of experience: career span from earliest start to latest end
  let years_of_experience: number | null = null;
  if (workEntries.length > 0) {
    const earliestStart = workEntries.reduce(
      (min, e) => (e.start.year * 12 + e.start.month < min ? e.start.year * 12 + e.start.month : min),
      Infinity
    );
    const latestEnd = workEntries.reduce(
      (max, e) => (e.end.year * 12 + e.end.month > max ? e.end.year * 12 + e.end.month : max),
      -Infinity
    );
    const spanMonths = latestEnd - earliestStart;
    years_of_experience = Math.round((spanMonths / 12) * 10) / 10;
  } else {
    // Fallback: explicit "X years of experience" mention
    const explicitMatch = rawText.match(/(\d+)\+?\s*years?\s+(?:of\s+)?(?:experience|exp\.?)\b/i);
    if (explicitMatch) years_of_experience = parseInt(explicitMatch[1], 10);
  }

  // Average tenure
  const avg_tenure_months =
    total_jobs > 0
      ? Math.round(
          workEntries.reduce((sum, e) => sum + e.durationMonths, 0) / total_jobs
        )
      : null;

  const employment_gaps = detectEmploymentGaps(workEntries);
  const education = extractEducation(raw_text);
  const skills = extractSkills(raw_text);
  const risks = detectRiskSignals(rawText, raw_text, skills, wordCount);

  const parsed: ParsedResume = {
    years_of_experience,
    most_recent_title,
    most_recent_company,
    education,
    skills,
    employment_gaps,
    total_jobs,
    avg_tenure_months,
    raw_text,
  };

  return { parsed, risks };
}
