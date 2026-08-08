-- CQC Schedule 3 reference parity: structured employment, conduct and referee data.
-- All columns are nullable so existing reference rows remain valid.

alter table public.carer_references
  add column if not exists reference_type text check (reference_type in ('employer','character','professional','client')),
  add column if not exists employment_start date,
  add column if not exists employment_end date,
  add column if not exists still_employed boolean,
  add column if not exists position_held text check (length(coalesce(position_held,'')) <= 120),
  add column if not exists weekly_hours numeric(4,1) check (weekly_hours is null or (weekly_hours >= 0 and weekly_hours <= 168)),
  add column if not exists reason_for_leaving text check (length(coalesce(reason_for_leaving,'')) <= 500),
  add column if not exists absence_days_12m int check (absence_days_12m is null or (absence_days_12m >= 0 and absence_days_12m <= 366)),
  add column if not exists sponsors_visa text check (length(coalesce(sponsors_visa,'')) <= 200),
  add column if not exists warnings_undisposed text check (warnings_undisposed in ('yes','no','unsure')),
  add column if not exists under_investigation text check (under_investigation in ('yes','no','unsure')),
  add column if not exists safeguarding_dbs text check (safeguarding_dbs in ('yes','no','unsure')),
  add column if not exists would_reemploy text check (would_reemploy in ('yes','no','unsure')),
  add column if not exists values_example text check (length(coalesce(values_example,'')) <= 2000),
  add column if not exists referee_position text check (length(coalesce(referee_position,'')) <= 120),
  add column if not exists referee_company text check (length(coalesce(referee_company,'')) <= 160),
  add column if not exists referee_company_addr text check (length(coalesce(referee_company_addr,'')) <= 500),
  add column if not exists referee_signed_date date,
  add column if not exists admin_notes text check (length(coalesce(admin_notes,'')) <= 1000);

create index if not exists carer_references_reference_type_idx
  on public.carer_references(reference_type);
create index if not exists carer_references_employment_gap_idx
  on public.carer_references(carer_id, employment_start, employment_end);

comment on column public.carer_references.reference_type is 'CQC Schedule 3 requires at least 1 employer reference. Types: employer|character|professional|client.';
comment on column public.carer_references.safeguarding_dbs is 'CQC Reg 19 satisfactory conduct check — must be answered before verify.';
