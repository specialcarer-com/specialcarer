alter table public.bookings
  add column if not exists recipient_ids uuid[] not null default '{}';

comment on column public.bookings.recipient_ids is 'household_recipients.id values this booking is for. Validated app-side.';
