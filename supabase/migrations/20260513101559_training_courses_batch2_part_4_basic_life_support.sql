-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260513101559.
-- Ledger row: 20260513101559 training_courses_batch2_part_4_basic_life_support
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

-- Seed the 'basic-life-support' training course. Idempotent via ON CONFLICT.
insert into public.training_courses
  (slug, title, category, is_required, ceu_credits, duration_minutes, required_for_agency_optin)
values
  ('basic-life-support', 'Basic Life Support (UK)', 'clinical', true, 2.0, 45, true)
on conflict (slug) do nothing;
