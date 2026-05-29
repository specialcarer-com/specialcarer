-- Live-in care is a manual-match product: families submit a request,
-- admins review and contact them, and the actual confirmed booking is
-- created later via the admin tool. This table holds the inbound
-- request itself.

create table if not exists public.live_in_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  service text not null,
  start_date date not null,
  weeks int not null check (weeks >= 1 and weeks <= 52),
  address text not null,
  notes text,
  contact_email text not null,
  contact_phone text,
  country text not null check (country in ('GB', 'US')),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'matched', 'booked', 'cancelled')),
  daily_rate_cents int not null,
  total_cents int not null,
  currency text not null check (currency in ('GBP', 'USD')),
  created_at timestamptz not null default now()
);

create index if not exists live_in_requests_status_idx
  on public.live_in_requests (status, created_at desc);
create index if not exists live_in_requests_user_idx
  on public.live_in_requests (user_id);

alter table public.live_in_requests enable row level security;

-- The /api/bookings/live-in/request endpoint uses the service-role
-- admin client, so anon/auth users do not need direct insert rights.
-- We only grant a narrow self-read so signed-in users can see their
-- own requests in their dashboard later.
drop policy if exists "owner can read own live-in requests" on public.live_in_requests;
create policy "owner can read own live-in requests"
  on public.live_in_requests for select
  using (auth.uid() is not null and auth.uid() = user_id);
