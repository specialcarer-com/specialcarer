-- Vertical taxonomy backfill (Tier 1, step 5)
-- Canonical 5 verticals: childcare, elderly_care, special_needs, postnatal, complex_care
-- Maps any legacy values to the canonical set so downstream filters/UI stay consistent.
--
-- Discovery (qupjaanyhnuvlexkwtpq, 2026-05-06):
--   bookings.service_type   : ['companion_care' (1), 'elderly_care' (1)]
--   caregiver_profiles.services : already canonical (childcare/elderly_care/special_needs/postnatal)
-- Mapping rule applied:
--   companion_care -> elderly_care
--   home_support   -> elderly_care   (no rows today, defensive)
--   senior_care    -> elderly_care   (no rows today, defensive)
--   newborn_care   -> postnatal      (no rows today, defensive)

begin;

-- 1) Bookings: legacy values -> canonical
update public.bookings
   set service_type = case service_type
       when 'companion_care' then 'elderly_care'
       when 'home_support'   then 'elderly_care'
       when 'senior_care'    then 'elderly_care'
       when 'newborn_care'   then 'postnatal'
       else service_type
   end
 where service_type in ('companion_care','home_support','senior_care','newborn_care');

-- 2) Caregiver profiles: rewrite services array element-wise
update public.caregiver_profiles cp
   set services = (
     select array_agg(distinct case s
         when 'companion_care' then 'elderly_care'
         when 'home_support'   then 'elderly_care'
         when 'senior_care'    then 'elderly_care'
         when 'newborn_care'   then 'postnatal'
         else s
     end)
     from unnest(cp.services) s
   )
 where exists (
   select 1 from unnest(cp.services) s
    where s in ('companion_care','home_support','senior_care','newborn_care')
 );

commit;
