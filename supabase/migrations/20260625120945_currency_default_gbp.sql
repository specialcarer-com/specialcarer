-- Default new rows to GBP everywhere.
--
-- Context:
--   SpecialCarers is a single-currency UK business (London) serving UK
--   customers; the default UI locale is en-GB. Money was rendering as USD ($)
--   in several consumer surfaces because rows carried currency='usd'/'USD'.
--   The display layer is fixed in code (formatGBP / formatMoney always render
--   GBP), and /api/stripe/create-booking-intent now forces 'gbp' for new
--   bookings, payment intents and payments rows.
--
--   This migration closes the remaining gap: the `currency` columns had NO
--   column-level default, so any insert path that omitted the field (or a
--   future one) could leave it unset / inconsistent. We pin the defaults to
--   GBP so new rows are correct by construction.
--
--   IMPORTANT: this only changes the DEFAULT for *new* rows. It deliberately
--   does NOT UPDATE existing rows — historical/live USD rows (e.g. real
--   bookings, the US test carer fixture) are left untouched pending a manual
--   decision. See the PR description for the existing-data audit.
--
--   Idempotent: `alter column ... set default` is safe to re-run.

-- bookings.currency  — check constraint allows ('gbp','usd'), lowercase.
alter table public.bookings
  alter column currency set default 'gbp';

-- caregiver_profiles.currency — stored uppercase ('GBP'/'USD') in app code.
-- The column predates the repo migration history, so guard on its presence.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'caregiver_profiles'
      and column_name = 'currency'
  ) then
    alter table public.caregiver_profiles
      alter column currency set default 'GBP';
  end if;
end$$;
