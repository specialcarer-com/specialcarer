-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260513101331.
-- Ledger row: 20260513101331 training_courses_batch2_part_1_safeguarding_adults
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

-- Seed the 'safeguarding-adults' training course. Idempotent via ON CONFLICT.
insert into public.training_courses
  (slug, title, category, is_required, ceu_credits, duration_minutes, required_for_agency_optin)
values
  ('safeguarding-adults', 'Safeguarding Adults (UK)', 'compliance', true, 1.5, 35, true)
on conflict (slug) do nothing;
