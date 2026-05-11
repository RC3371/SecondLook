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
