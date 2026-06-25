-- Active-job task checklist for bookings.
--
-- Stored as jsonb array of items: [{ id: string, text: string, done: boolean,
--   done_at: string|null, done_by: uuid|null }]
--
-- Either party can read; only the carer (provider_id) or the booking owner
-- (user_id) can update. The existing RLS on `bookings` already restricts
-- updates to those parties, so no new policy is required.

alter table public.bookings
  add column if not exists task_checklist jsonb not null default '[]'::jsonb;

-- Defensive sanity check: must always be a JSON array.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bookings_task_checklist_is_array'
  ) then
    alter table public.bookings
      add constraint bookings_task_checklist_is_array
      check (jsonb_typeof(task_checklist) = 'array');
  end if;
end $$;
