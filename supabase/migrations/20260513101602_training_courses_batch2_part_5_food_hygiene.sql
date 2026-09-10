-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260513101602.
-- Ledger row: 20260513101602 training_courses_batch2_part_5_food_hygiene
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

-- Seed the 'food-hygiene' training course. Idempotent via ON CONFLICT.
insert into public.training_courses
  (slug, title, category, is_required, ceu_credits, duration_minutes, required_for_agency_optin)
values
  ('food-hygiene', 'Food Hygiene (UK)', 'clinical', true, 1.0, 30, true)
on conflict (slug) do nothing;
