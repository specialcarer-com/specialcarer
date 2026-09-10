-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260617184307.
-- Ledger row: 20260617184307 carer_outreach_crm_seed
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

-- Seed the initial outreach pipeline. Idempotent via ON CONFLICT.
-- Values are the initial set from the ledger migration; live prod may have added stages.
insert into public.outreach_stages (stage, crm_label, sort_order)
values
  ('lead',                    'Lead',                    10),
  ('applied',                 'Applied',                 20),
  ('screening',               'Screening',               30),
  ('references_pending',      'References pending',      40),
  ('dbs_pending',             'DBS pending',             50),
  ('ready_for_interview',     'Ready for interview',     60),
  ('interview_scheduled',     'Interview scheduled',     70),
  ('offer_extended',          'Offer extended',          80),
  ('onboarded',               'Onboarded',               90),
  ('active',                  'Active',                 100),
  ('paused',                  'Paused',                 110),
  ('rejected',                'Rejected',               120)
on conflict (stage) do nothing;

-- Template seed is intentionally minimal here — real templates are managed
-- through /admin/outreach and live in outreach_email_templates.
