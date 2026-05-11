-- ── Consent fields on applications ───────────────────────────────────────────
--
-- Status lifecycle:
--   pending_consent  → uploaded, awaiting candidate response
--   consent_given    → candidate approved processing
--   consent_declined → candidate declined processing
--   triaged          → AI triage completed
--   referred         → sent to a colleague for review
--   rejected         → manually or automatically rejected
--
-- Only applications with status = 'consent_given' are passed to the AI batch
-- processor. The triage route enforces this with .eq('status', 'consent_given').

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS consent_expires_at   timestamptz,
  ADD COLUMN IF NOT EXISTS consent_responded_at  timestamptz;

-- Resume text stored on applicants so it is available when triage runs later.
ALTER TABLE applicants
  ADD COLUMN IF NOT EXISTS resume_text text;

-- ── RLS policy: org isolation via job_posting relationship ───────────────────
--
-- applications has no direct org_id column; org scoping is inherited through
-- the job_posting_id FK (job_postings.org_id) and applicant_id FK
-- (applicants.org_id).  This policy enforces that a session can only read or
-- write applications that belong to its own organisation.
--
-- Prerequisite: a helper that returns the Clerk org id from the current JWT.
-- Create it once if it doesn't already exist:
--
-- CREATE OR REPLACE FUNCTION get_clerk_org_id()
-- RETURNS text
-- LANGUAGE sql STABLE
-- AS $$ SELECT nullif(current_setting('request.jwt.claims', true)::json->>'org_id', '')::text $$;
--
-- Enable RLS and create the policy:
--
-- ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "org_isolation" ON applications
--   USING (
--     job_posting_id IN (
--       SELECT id FROM job_postings
--       WHERE org_id = (
--         SELECT id FROM organizations
--         WHERE clerk_org_id = get_clerk_org_id()
--       )
--     )
--   );
--
-- Note: server-side routes that use the service-role key bypass RLS by design.
-- This policy applies to anon/authenticated role queries only (e.g. the
-- browser Supabase client used for real-time subscriptions).

-- ── Auto-reject expired consent records (nightly pg_cron job) ─────────────────
--
-- Requires pg_cron extension. Enable it in the Supabase dashboard under
-- Database → Extensions, then run this block once in the SQL editor.
--
-- SELECT cron.schedule(
--   'auto-reject-expired-consent',   -- job name
--   '0 2 * * *',                      -- 02:00 UTC every night
--   $$
--     UPDATE applications
--     SET    status = 'rejected'
--     WHERE  status             = 'pending_consent'
--       AND  consent_expires_at < now()
--       AND  consent_responded_at IS NULL;
--   $$
-- );
--
-- To verify the job was registered:
--   SELECT * FROM cron.job WHERE jobname = 'auto-reject-expired-consent';
--
-- To remove it later:
--   SELECT cron.unschedule('auto-reject-expired-consent');

-- ── Supabase DB function alternative (if pg_cron is not available) ────────────
--
-- Create a Postgres function and call it from a Supabase Edge Function on a
-- schedule instead:
--
-- CREATE OR REPLACE FUNCTION expire_pending_consent()
-- RETURNS void
-- LANGUAGE sql
-- SECURITY DEFINER
-- AS $$
--   UPDATE applications
--   SET    status = 'rejected'
--   WHERE  status             = 'pending_consent'
--     AND  consent_expires_at < now()
--     AND  consent_responded_at IS NULL;
-- $$;
