-- Persist the signed upload destination to prevent path spoofing on submit.
alter table public.carer_references
  add column if not exists upload_path text;

comment on column public.carer_references.upload_path is
  'Persisted expected upload path for a referee-provided document, set when a signed URL is issued to prevent path spoofing on submit.';
