-- Keep candidate consent inactive until its signed PDF has been generated and stored.
alter table public.carer_reference_consents
  add column if not exists consent_pdf_status text not null default 'pending'
    check (consent_pdf_status in ('pending', 'active', 'failed')),
  add column if not exists consent_pdf_error text;

-- Existing rows with a stored PDF were successfully generated before status tracking.
update public.carer_reference_consents
set consent_pdf_status = 'active'
where pdf_storage_path is not null
  and consent_pdf_status = 'pending';

comment on column public.carer_reference_consents.consent_pdf_status is
  'PDF generation status: pending while generating, active only after a PDF is stored, or failed when generation/upload fails.';
comment on column public.carer_reference_consents.consent_pdf_error is
  'Most recent PDF generation or storage error, retained to support an authenticated retry.';
