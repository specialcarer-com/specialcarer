-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260506225734.
-- Ledger row: 20260506225734 caregiver_points_rpc
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

-- caregiver_points(uuid[]) RPC (returns id + lat/lng for a set of caregivers).
CREATE OR REPLACE FUNCTION public.caregiver_points(p_user_ids uuid[])
 RETURNS TABLE(user_id uuid, lat double precision, lng double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select
    cp.user_id,
    extensions.ST_Y(cp.home_point::extensions.geometry) as lat,
    extensions.ST_X(cp.home_point::extensions.geometry) as lng
  from public.caregiver_profiles cp
  where cp.user_id = any(p_user_ids)
    and cp.is_published = true
    and cp.home_point is not null;
$function$;
