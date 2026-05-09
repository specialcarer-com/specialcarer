-- Support & Safety v3.10 — admin-editable support_settings, carer
-- safety reports, leave-from-job requests, and a single-board carer
-- community forum (threads + replies + community moderation reports).
--
-- ADDITIVE only. The existing sos_alerts and emergency_contacts tables
-- are not touched. RLS guards modelled on the carer-vetting and
-- training-v3.9 migrations (pg_policies.policyname, pg_trigger.tgname).

-- ════════════════════════════════════════════════════════════════════
-- 1. support_settings — singleton row with admin-editable copy.
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.support_settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null unique default true,
  hotline_phone_uk text not null default '+44 800 000 0000',
  hotline_phone_us text not null default '+1 800-000-0000',
  hotline_hours text not null default '24/7',
  support_email text not null default 'support@specialcarer.com',
  chat_enabled boolean not null default false,
  chat_url text,
  insurance_summary_md text not null default '',
  worker_protection_md text not null default '',
  updated_at timestamptz not null default now(),
  constraint support_settings_singleton_only check (singleton = true)
);

alter table public.support_settings enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'support_settings_authenticated_select'
      and tablename = 'support_settings'
  ) then
    create policy support_settings_authenticated_select on public.support_settings
      for select to anon, authenticated
      using (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'support_settings_admin_write'
      and tablename = 'support_settings'
  ) then
    create policy support_settings_admin_write on public.support_settings
      for all to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin'
        )
      )
      with check (
        exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin'
        )
      );
  end if;
end $$;

-- Seed the singleton row with default copy. The application reads the
-- row by `singleton = true` so the id doesn't matter; this insert is
-- a one-shot guarded by the unique constraint.
insert into public.support_settings (
  insurance_summary_md, worker_protection_md
)
select
$ins$[REVIEW BY BROKER] — placeholder copy. Final wording must be reviewed and signed off by All Care 4 U Group Ltd's insurance broker before being relied on by users.

# Insurance summary

This page summarises the insurance position of All Care 4 U Group Ltd (trading as **SpecialCarer**) and the cover available to carers and customers using the platform. It is a summary, not a contract — full policy schedules are available on request from the support team.

## United Kingdom

- **Public liability** — All Care 4 U Group Ltd holds a £5,000,000 Public Liability policy that responds to third-party injury or property damage caused by the negligent acts or omissions of the company and its directly-engaged staff.
- **Employer's liability** — Where carers are engaged by All Care 4 U Group Ltd as employees rather than as independent contractors, an Employer's Liability policy of £10,000,000 is in place as required by the Employers' Liability (Compulsory Insurance) Act 1969.
- **Professional indemnity** — A £1,000,000 Professional Indemnity policy responds to claims arising from professional advice given by the company. Care services delivered by independent carer-contractors fall outside this cover.
- **Carer recommendation** — Independent carer-contractors are strongly recommended to carry their own Public Liability and Professional Indemnity insurance. The platform fee already incorporates a contribution towards a group insurance arrangement; details of opt-in cover are available from support@specialcarer.com.
- **Complaints process** — Complaints relating to insurance matters should be addressed in writing to support@specialcarer.com. The Complaints Officer will acknowledge within 5 business days and aim to resolve within 8 weeks. If you remain dissatisfied, you may refer the matter to the Financial Ombudsman Service (FOS) provided you fall within the FOS's jurisdiction.

## United States

- **Independent contractor disclosure** — Carers operating in the United States via SpecialCarer are engaged as independent (1099) contractors, not employees of All Care 4 U Group Ltd or any US affiliate. Carers are responsible for their own federal, state and local tax obligations.
- **General liability recommendation** — Independent contractors are strongly recommended to carry general liability cover with limits of at least USD 1,000,000 per occurrence / USD 2,000,000 aggregate. Several insurers offer affordable per-shift or annual policies tailored to home-care contractors.
- **Professional liability recommendation** — Carers performing skilled care, including medication administration, wound care, dementia-specialised support or paediatric care should carry professional liability (errors-and-omissions) cover of at least USD 1,000,000.
- **State-specific notes [PLACEHOLDER]** — California, New York, Massachusetts and Washington each impose specific contractor-classification rules and minimum-wage / overtime regimes that may vary the recommendations above. Carers operating in those states should consult a local CPA or labor attorney for guidance specific to their circumstances.
- **Workers' compensation** — Most US states do not require independent contractors to carry workers' compensation; however, individual contracts with care recipients (especially residential or facility-based engagements) may require proof of cover. SpecialCarer does not provide US workers' compensation.
- **Customer responsibilities** — Family customers contracting independent care for a household may have employer-of-record obligations under federal and state Domestic Worker laws. SpecialCarer's role is limited to providing the introduction platform; we do not act as employer of record for either party.

## Reporting and contact

For any insurance-related question, claim or complaint, please email **support@specialcarer.com** with the subject line "Insurance enquiry" and include your booking reference where applicable. Urgent matters during an active shift should be raised via the in-app SOS button followed by emergency-services contact (999 in the UK, 911 in the US) where life or limb is at risk.

This summary is updated periodically. The version published in-platform supersedes any earlier copy.
$ins$,
$wp$# Worker protections

Carers who use the SpecialCarer platform are independent professionals. Independence is not isolation — the platform exists in part to make sure no carer feels alone, unsafe or unfairly treated on a shift. This page sets out the protections every carer can rely on.

## Right to a safe working environment

You have the right to expect that the home, facility or other location where you provide care is reasonably safe. You should be told in advance about any hazards (aggressive pets, infectious illness, unsafe equipment) and the safeguards in place. If you arrive at a shift and the environment is materially different from what was disclosed, you are entitled to refuse the shift and be paid for your time and travel up to that point.

## Right to leave a shift that becomes unsafe

If a shift becomes unsafe — through threatening behaviour, an unexpected medical emergency, an unfit environment, or any other significant change — you have the right to leave. Use the **Request to leave** flow on the booking screen to notify SpecialCarer. We will:

- log the request,
- contact the customer to communicate that the shift has ended,
- arrange a replacement carer where the customer needs continuing cover,
- pay you for the hours actually worked plus any cancellation protection that applies to your booking type.

You are not required to wait for our response before stepping back from immediate physical danger. Use the in-app SOS button or call 999 / 911 if life or limb is at risk.

## Right to escalate

If you have a concern that does not warrant SOS but is not being resolved at the booking level, you can escalate at any time:

- **Hotline:** the numbers and hours are listed on the in-app Support &amp; Safety page.
- **Email:** support@specialcarer.com — Trust &amp; Safety acknowledges within 4 business hours.

You will not be removed from the platform, marked down on the matching algorithm, or otherwise penalised for raising a concern in good faith.

## Anti-retaliation

Retaliation against a carer for raising a safety, payment or behaviour concern — by any party — is a violation of the SpecialCarer terms of service. Examples of prohibited retaliation include withholding payment, posting a punitive review in response to a safeguarding report, or attempting to engage the carer off-platform to circumvent platform protections. We investigate every retaliation claim and the platform fee structure is designed to be neutral to who raised what.

## Pay protections

- **Private bookings (consumer customers):** payouts are processed weekly. Earnings from a Monday-to-Sunday week settle the following Tuesday provided the shift has completed and the 24-hour dispute window has closed without challenge.
- **Organisation bookings:** organisation customers are invoiced on net-14 terms; payouts to carers happen monthly once the customer invoice has cleared. Sleep-in duties for organisations are paid at the company-set rate (currently £50 per duty in the UK; equivalent to be confirmed in the US) regardless of the carer's standard hourly rate.
- **Cancellation cover:** if the customer cancels with less than 24 hours' notice you are paid 50% of the booked rate. If the customer no-shows, you are paid 100% for up to the first 4 hours.

## Discrimination and harassment

The SpecialCarer platform does not tolerate discrimination on the basis of race, ethnicity, religion, gender, gender identity, sexual orientation, disability, age, pregnancy or marital status. Carers experiencing discriminatory or harassing behaviour from a customer, an organisation contact or another carer should report it through Support &amp; Safety. Reports are investigated by Trust &amp; Safety; outcomes can include warnings, removal from the platform, or referral to law enforcement where the behaviour is criminal.

## Reporting

Use the **Report unsafe client** or **Report community post** flow in the app, or email support@specialcarer.com. We aim to acknowledge every report within 4 business hours and provide a substantive update within 5 business days. Where a safeguarding referral or law-enforcement referral is required, we make that referral as well as updating you on the status.

This page is reviewed at least annually and is updated whenever the protections it describes change.
$wp$
where not exists (select 1 from public.support_settings);

-- ════════════════════════════════════════════════════════════════════
-- 2. safety_reports — carer-raised reports about a client / situation.
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.safety_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  subject_user_id uuid references auth.users(id) on delete set null,
  report_type text not null
    check (report_type in (
      'verbal_abuse','physical_threat','unsafe_environment',
      'inappropriate_request','non_payment','other'
    )),
  severity text not null
    check (severity in ('low','medium','high','immediate_danger')),
  description text not null check (length(description) between 10 and 5000),
  evidence_urls text[] not null default array[]::text[],
  status text not null default 'open'
    check (status in ('open','triaging','escalated','resolved','dismissed')),
  admin_notes text not null default '',
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists safety_reports_reporter_idx
  on public.safety_reports(reporter_user_id);
create index if not exists safety_reports_status_idx
  on public.safety_reports(status);
create index if not exists safety_reports_booking_idx
  on public.safety_reports(booking_id);

alter table public.safety_reports enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'safety_reports_reporter_insert'
      and tablename = 'safety_reports'
  ) then
    create policy safety_reports_reporter_insert on public.safety_reports
      for insert to authenticated
      with check (reporter_user_id = (select auth.uid()));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'safety_reports_reporter_select'
      and tablename = 'safety_reports'
  ) then
    create policy safety_reports_reporter_select on public.safety_reports
      for select to authenticated
      using (
        reporter_user_id = (select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin'
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'safety_reports_admin_update'
      and tablename = 'safety_reports'
  ) then
    create policy safety_reports_admin_update on public.safety_reports
      for update to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin'
        )
      )
      with check (
        exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin'
        )
      );
  end if;
end $$;

-- Trigger: when a report is filed with severity 'immediate_danger',
-- automatically raise an SOS alert on the reporter's behalf so the
-- existing SOS workflow (admin email, on-call paging) kicks in.
create or replace function public.safety_reports_auto_sos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.severity = 'immediate_danger' then
    insert into public.sos_alerts (user_id, booking_id, note, status)
    values (
      new.reporter_user_id,
      new.booking_id,
      'Auto-raised from immediate-danger safety report ' || new.id::text,
      'open'
    );
  end if;
  return new;
end;
$$;

do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'safety_reports_auto_sos_trg'
  ) then
    create trigger safety_reports_auto_sos_trg
      after insert on public.safety_reports
      for each row execute function public.safety_reports_auto_sos();
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════
-- 3. leave_requests — carer asks to leave a live booking.
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  carer_user_id uuid not null references auth.users(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  reason text not null
    check (reason in (
      'feeling_unsafe','medical','family_emergency',
      'client_behaviour','other'
    )),
  description text not null check (length(description) between 10 and 2000),
  replacement_needed boolean not null default true,
  status text not null default 'open'
    check (status in ('open','approved','denied','withdrawn')),
  admin_notes text not null default '',
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists leave_requests_carer_idx
  on public.leave_requests(carer_user_id);
create index if not exists leave_requests_status_idx
  on public.leave_requests(status);
create index if not exists leave_requests_booking_idx
  on public.leave_requests(booking_id);

-- Partial unique index: at most one open leave request per carer/booking.
create unique index if not exists leave_requests_open_unique
  on public.leave_requests (booking_id, carer_user_id)
  where status = 'open';

alter table public.leave_requests enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'leave_requests_carer_insert'
      and tablename = 'leave_requests'
  ) then
    create policy leave_requests_carer_insert on public.leave_requests
      for insert to authenticated
      with check (carer_user_id = (select auth.uid()));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'leave_requests_carer_select'
      and tablename = 'leave_requests'
  ) then
    create policy leave_requests_carer_select on public.leave_requests
      for select to authenticated
      using (
        carer_user_id = (select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin'
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'leave_requests_carer_update_withdraw'
      and tablename = 'leave_requests'
  ) then
    create policy leave_requests_carer_update_withdraw on public.leave_requests
      for update to authenticated
      using (carer_user_id = (select auth.uid()))
      with check (carer_user_id = (select auth.uid()));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'leave_requests_admin_update'
      and tablename = 'leave_requests'
  ) then
    create policy leave_requests_admin_update on public.leave_requests
      for update to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin'
        )
      )
      with check (
        exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin'
        )
      );
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════
-- 4. forum_threads + 5. forum_posts + 6. forum_reports
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.forum_threads (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references auth.users(id) on delete cascade,
  category text not null
    check (category in (
      'general','tips','elderly_care','childcare','special_needs',
      'postnatal','complex_care','safety_stories'
    )),
  title text not null check (length(title) between 5 and 200),
  body_md text not null check (length(body_md) between 10 and 5000),
  is_pinned boolean not null default false,
  is_locked boolean not null default false,
  is_deleted boolean not null default false,
  reply_count integer not null default 0,
  last_post_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists forum_threads_category_idx
  on public.forum_threads(category, is_pinned desc, last_post_at desc);
create index if not exists forum_threads_author_idx
  on public.forum_threads(author_user_id);

alter table public.forum_threads enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'forum_threads_authenticated_select'
      and tablename = 'forum_threads'
  ) then
    create policy forum_threads_authenticated_select on public.forum_threads
      for select to authenticated
      using (
        is_deleted = false
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin'
        )
      );
  end if;
end $$;

-- Author can insert if they have at least one verified certification.
-- Verified-carer check is duplicated in the API layer for clearer error
-- messages, but RLS provides defence in depth.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'forum_threads_verified_carer_insert'
      and tablename = 'forum_threads'
  ) then
    create policy forum_threads_verified_carer_insert on public.forum_threads
      for insert to authenticated
      with check (
        author_user_id = (select auth.uid())
        and exists (
          select 1 from public.carer_certifications cc
          where cc.carer_id = (select auth.uid())
            and cc.status = 'verified'
        )
      );
  end if;
end $$;

-- Author can edit their thread (within 30 minutes — enforced in API).
-- Admin can always update.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'forum_threads_author_or_admin_update'
      and tablename = 'forum_threads'
  ) then
    create policy forum_threads_author_or_admin_update on public.forum_threads
      for update to authenticated
      using (
        author_user_id = (select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin'
        )
      )
      with check (
        author_user_id = (select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin'
        )
      );
  end if;
end $$;

create table if not exists public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.forum_threads(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  body_md text not null check (length(body_md) between 1 and 5000),
  is_deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists forum_posts_thread_idx
  on public.forum_posts(thread_id, created_at);
create index if not exists forum_posts_author_idx
  on public.forum_posts(author_user_id);

alter table public.forum_posts enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'forum_posts_authenticated_select'
      and tablename = 'forum_posts'
  ) then
    create policy forum_posts_authenticated_select on public.forum_posts
      for select to authenticated
      using (
        is_deleted = false
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin'
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'forum_posts_verified_carer_insert'
      and tablename = 'forum_posts'
  ) then
    create policy forum_posts_verified_carer_insert on public.forum_posts
      for insert to authenticated
      with check (
        author_user_id = (select auth.uid())
        and exists (
          select 1 from public.carer_certifications cc
          where cc.carer_id = (select auth.uid())
            and cc.status = 'verified'
        )
        and exists (
          select 1 from public.forum_threads ft
          where ft.id = thread_id and ft.is_locked = false and ft.is_deleted = false
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'forum_posts_author_or_admin_update'
      and tablename = 'forum_posts'
  ) then
    create policy forum_posts_author_or_admin_update on public.forum_posts
      for update to authenticated
      using (
        author_user_id = (select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin'
        )
      )
      with check (
        author_user_id = (select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin'
        )
      );
  end if;
end $$;

-- Trigger: on each new reply, bump reply_count and last_post_at on the parent.
create or replace function public.forum_posts_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.forum_threads
    set reply_count = reply_count + 1,
        last_post_at = now()
    where id = new.thread_id;
  return new;
end;
$$;

do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'forum_posts_after_insert_trg'
  ) then
    create trigger forum_posts_after_insert_trg
      after insert on public.forum_posts
      for each row execute function public.forum_posts_after_insert();
  end if;
end $$;

-- forum_reports — community moderation reports.
create table if not exists public.forum_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.forum_threads(id) on delete cascade,
  post_id uuid references public.forum_posts(id) on delete cascade,
  reason text not null
    check (reason in (
      'spam','harassment','off_topic','misinformation',
      'safety_concern','other'
    )),
  description text not null default '',
  status text not null default 'open'
    check (status in ('open','dismissed','actioned')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint forum_reports_target_present
    check (thread_id is not null or post_id is not null)
);
create index if not exists forum_reports_status_idx
  on public.forum_reports(status);
create index if not exists forum_reports_thread_idx
  on public.forum_reports(thread_id);
create index if not exists forum_reports_post_idx
  on public.forum_reports(post_id);

alter table public.forum_reports enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'forum_reports_reporter_insert'
      and tablename = 'forum_reports'
  ) then
    create policy forum_reports_reporter_insert on public.forum_reports
      for insert to authenticated
      with check (reporter_user_id = (select auth.uid()));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'forum_reports_admin_select'
      and tablename = 'forum_reports'
  ) then
    create policy forum_reports_admin_select on public.forum_reports
      for select to authenticated
      using (
        reporter_user_id = (select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin'
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'forum_reports_admin_update'
      and tablename = 'forum_reports'
  ) then
    create policy forum_reports_admin_update on public.forum_reports
      for update to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin'
        )
      )
      with check (
        exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin'
        )
      );
  end if;
end $$;
