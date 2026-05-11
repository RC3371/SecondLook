/*
 Deprecated browser bootstrap for Supabase — DO NOT commit keys here.

 This file previously contained a hard-coded Supabase URL and anon key
 which exposed credentials in the repository and in static pages.

 Use the Next.js client helpers instead:
 - `src/lib/supabase/client.ts` (browser/client-side)
 - `src/lib/supabase/server.ts` (server-side)

 If you still need a client on a static page, wire the anon key at runtime
 and avoid committing it to source control. For production, keep keys in
 environment variables and never store service_role keys client-side.
*/

if (typeof window !== 'undefined') {
    // Placeholder to avoid runtime errors in legacy static pages.
    try { window.supabaseClient = null; } catch (e) { /* ignore */ }
}
