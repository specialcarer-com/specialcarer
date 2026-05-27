-- Fix Supabase security advisor: auth_users_exposed (ERROR).
--
-- Two admin-facing views in the public schema joined auth.users to surface
-- emails alongside compliance/background-check status, but both views had
-- SELECT (and DML) granted to anon and authenticated. Anyone with the
-- publishable/anon key could query them via PostgREST and read user emails.
--
-- This migration:
--   1. Recreates both views with security_invoker = true so they enforce
--      the querying user's RLS rather than the view creator's.
--   2. Revokes ALL privileges from anon, authenticated, and PUBLIC.
--   3. Grants SELECT only to service_role (admin server-side reads).
--
-- The application admin dashboards already use the service-role key via
-- createAdminClient(), so no application code needs to change.
-- Also clears 2 of the security_definer_view ERRORs by recreating without
-- SECURITY DEFINER.

DROP VIEW IF EXISTS public.compliance_alerts_view;
CREATE VIEW public.compliance_alerts_view
WITH (security_invoker = true) AS
SELECT cd.id AS document_id,
       cd.caregiver_id,
       p.full_name,
       u.email,
       cd.doc_type,
       cd.status,
       cd.expires_at,
       CASE WHEN cd.expires_at IS NULL THEN NULL::integer
            ELSE cd.expires_at - CURRENT_DATE END AS days_to_expiry
  FROM compliance_documents cd
  LEFT JOIN profiles    p ON p.id = cd.caregiver_id
  LEFT JOIN auth.users  u ON u.id = cd.caregiver_id
 WHERE cd.status = 'expired'
    OR (cd.expires_at IS NOT NULL AND cd.expires_at <= CURRENT_DATE + INTERVAL '30 days');

REVOKE ALL ON public.compliance_alerts_view FROM anon, authenticated, PUBLIC;
GRANT  SELECT ON public.compliance_alerts_view TO service_role;

DROP VIEW IF EXISTS public.reverify_queue_v;
CREATE VIEW public.reverify_queue_v
WITH (security_invoker = true) AS
SELECT bc.id AS background_check_id,
       bc.user_id,
       p.full_name,
       u.email,
       bc.check_type,
       bc.vendor,
       bc.status AS check_status,
       bc.issued_at,
       bc.expires_at,
       bc.next_reverify_at,
       bc.reverify_cadence_months,
       bc.reverify_status,
       CASE WHEN bc.next_reverify_at IS NULL THEN NULL::integer
            ELSE bc.next_reverify_at - CURRENT_DATE END AS due_in_days
  FROM background_checks bc
  LEFT JOIN profiles    p ON p.id = bc.user_id
  LEFT JOIN auth.users  u ON u.id = bc.user_id;

REVOKE ALL ON public.reverify_queue_v FROM anon, authenticated, PUBLIC;
GRANT  SELECT ON public.reverify_queue_v TO service_role;
