import { z } from "zod";

export const MAX_CANDIDATES_PER_REQUEST = 500;
export const MAX_RESUME_TEXT_CHARS = 100_000;
export const MAX_JSON_DEPTH = 20;
export const MAX_RECRUITER_NOTE_CHARS = 2_000;
export const MAX_UPLOAD_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,120}$/;

export const safeIdSchema = z
  .string()
  .trim()
  .regex(SAFE_ID_RE, "Invalid id format");

export const candidateInputSchema = z
  .object({
    id: safeIdSchema,
    resume_text: z.string().min(1).max(MAX_RESUME_TEXT_CHARS),
  })
  .strict();

export const triageRequestSchema = z
  .object({
    req_id: safeIdSchema,
    candidates: z
      .array(candidateInputSchema)
      .min(1)
      .max(MAX_CANDIDATES_PER_REQUEST),
  })
  .strict();

export const requisitionCriteriaSchema = z
  .object({
    required: z
      .object({
        min_years_experience: z.number().finite().min(0).max(80),
        seniority: z.string().trim().min(1).max(40),
        skills: z.array(z.string().trim().min(1).max(80)).min(1).max(50),
      })
      .strict(),
    preferred: z.array(z.string().trim().min(1).max(80)).max(50),
    dealbreakers: z.array(z.string().trim().min(1).max(120)).max(50),
  })
  .strict();

export const allowedResumeMimeTypes = new Set([
  "application/pdf",
  "text/csv",
  "application/vnd.ms-excel",
]);

export const uploadFormInputSchema = z
  .object({
    req_id: safeIdSchema,
    file: z.custom<File>((value) => value instanceof File, "Missing file"),
  })
  .superRefine((value, ctx) => {
    if (!allowedResumeMimeTypes.has(value.file.type)) {
      ctx.addIssue({
        code: "custom",
        message: "Only PDF or CSV files are allowed",
        path: ["file"],
      });
    }
    if (value.file.size > MAX_UPLOAD_FILE_BYTES) {
      ctx.addIssue({
        code: "custom",
        message: "File too large",
        path: ["file"],
      });
    }
  });

export const recruiterNoteSchema = z
  .string()
  .max(MAX_RECRUITER_NOTE_CHARS);

export const referralSendSchema = z
  .object({
    candidate_id: safeIdSchema,
    req_id: safeIdSchema,
    to_recruiter_id: safeIdSchema,
  })
  .strict();

export const webhookHeadersSchema = z
  .object({
    svix_id: z.string().min(1),
    svix_timestamp: z.string().min(1),
    svix_signature: z.string().min(1),
  })
  .strict()

export const APPLICATION_STATUSES = [
  'pending_consent',
  'consent_given',
  'consent_declined',
  'triaged',
  'referred',
  'rejected',
] as const

export type ApplicationStatus = typeof APPLICATION_STATUSES[number]

export const consentDecisionSchema = z
  .object({
    decision: z.enum(['given', 'declined']),
  })
  .strict();

function getDepth(value: unknown, depth = 0): number {
  if (value === null || typeof value !== "object") return depth;

  if (Array.isArray(value)) {
    if (value.length === 0) return depth + 1;
    return Math.max(...value.map((v) => getDepth(v, depth + 1)));
  }

  const entries = Object.values(value as Record<string, unknown>);
  if (entries.length === 0) return depth + 1;
  return Math.max(...entries.map((v) => getDepth(v, depth + 1)));
}

export function hasSafeJsonDepth(
  value: unknown,
  maxDepth = MAX_JSON_DEPTH
): boolean {
  return getDepth(value) <= maxDepth;
}
