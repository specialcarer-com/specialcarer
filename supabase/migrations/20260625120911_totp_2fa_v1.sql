-- ============================================================================
-- SpecialCarer — TOTP 2FA v1 (gap 13)
--
-- Two-factor authentication via authenticator apps (Google Authenticator,
-- Authy, 1Password, …). The TOTP factor lifecycle itself is owned by Supabase
-- Auth's native MFA (auth.mfa_factors, supabase.auth.mfa.*) — we do NOT
-- re-implement TOTP. This migration adds only the bits Supabase MFA does not
-- provide:
--
--   1. Per-user enrolment policy on `profiles`:
--        - mfa_required            : admin/CQC may force a user to enrol
--        - mfa_grace_period_ends_at: deadline after which sign-in is blocked
--          until a factor is enrolled. Enforced at the sign-in PATH (not via a
--          DB trigger) so legitimate sessions aren't killed mid-flight.
--      Both default to "nobody is forced yet" for V1.
--
--   2. `mfa_recovery_codes`: single-use fallback codes shown once at enrolment.
--      Only the hash is stored (Node crypto.scrypt, see src/lib/security/*).
--      `batch_id` groups the 10 codes minted together so "regenerate" can
--      invalidate the prior batch atomically.
--
-- Writes are performed server-side through the service-role client; RLS here is
-- the read/authorisation backstop for the user-scoped client. A user may learn
-- HOW MANY unused codes they have, but never read the hashes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enrolment policy columns on profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists mfa_required boolean not null default false,
  add column if not exists mfa_grace_period_ends_at timestamptz;

comment on column public.profiles.mfa_required is
  'When true, the user must enrol a TOTP factor; checked at the sign-in path (gap 13).';
comment on column public.profiles.mfa_grace_period_ends_at is
  'Sign-in is blocked until enrolment once this passes; set when mfa_required flips on.';

-- ---------------------------------------------------------------------------
-- 2. Recovery codes
-- ---------------------------------------------------------------------------
create table if not exists public.mfa_recovery_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  code_hash   text not null,
  batch_id    uuid not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

comment on table public.mfa_recovery_codes is
  'Single-use 2FA recovery codes (gap 13). Only scrypt hashes are stored; plaintext is shown once at generation time.';

-- Hot path: "how many unused codes does this user have" and "find the unused
-- code matching this hash". Partial index keeps it tight to live codes.
create index if not exists mfa_recovery_codes_user_unused_idx
  on public.mfa_recovery_codes (user_id)
  where used_at is null;

create index if not exists mfa_recovery_codes_batch_idx
  on public.mfa_recovery_codes (batch_id);

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
alter table public.mfa_recovery_codes enable row level security;

-- Users may read their own rows (to count remaining codes). They can see the
-- hash column at the SQL level, but the API never selects it for the user; and
-- a scrypt hash is not reversible. Writes are service-role only (no INSERT /
-- UPDATE / DELETE policy for authenticated users), so the user-scoped client
-- cannot mint or burn codes — only the server endpoints can.
drop policy if exists "recovery codes readable by owner" on public.mfa_recovery_codes;
create policy "recovery codes readable by owner"
  on public.mfa_recovery_codes for select
  using (auth.uid() = user_id);
