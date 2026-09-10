-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260513101553.
-- Ledger row: 20260513101553 training_courses_batch2_part_2_safeguarding_children
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

-- Seed the 'safeguarding-children' training course. Idempotent via ON CONFLICT.
insert into public.training_courses
  (slug, title, category, is_required, ceu_credits, duration_minutes, required_for_agency_optin)
values
  ('safeguarding-children', 'Safeguarding Children (UK)', 'compliance', true, 1.5, 35, true)
on conflict (slug) do nothing;
