-- Gap 4 (9 Jun 2026 CareLink audit): in-chat translation.
--
-- SpecialCarers has a multilingual carer base. Chat messages are stored
-- as-typed; the viewer can opt into seeing incoming messages translated
-- into their preferred language. Translations are cached per
-- (message, target language) so we only pay the LLM cost once per pair
-- and every subsequent render (any viewer, any device) is a cache read.
--
-- Inserts are service-role only (the translate route runs the LLM call
-- server-side and writes the row). Participants get SELECT via RLS so
-- the client can render cached rows without a round-trip to the model.

create table chat_message_translations (
  message_id uuid not null references chat_messages(id) on delete cascade,
  target_lang text not null check (target_lang ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  translated_body text not null check (length(translated_body) between 1 and 8000),
  detected_source_lang text,
  provider text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, target_lang)
);
create index on chat_message_translations(message_id);

alter table chat_message_translations enable row level security;

-- Participants of a message's thread may read its cached translations.
create policy "participants read translations in their threads"
on chat_message_translations
for select using (
  exists (
    select 1 from chat_messages m
    join chat_participants p on p.thread_id = m.thread_id
    where m.id = chat_message_translations.message_id
    and p.user_id = auth.uid()
  )
);
-- No insert/update/delete policy: writes flow through the service role
-- in the translate route, which bypasses RLS.

-- Per-user "translate incoming chat into this language" preference.
-- NULL = off (the default). ISO 639-1, optionally with a region tag,
-- matching the translation cache's target_lang check.
alter table public.profiles
  add column if not exists chat_translate_to text
    check (chat_translate_to is null or chat_translate_to ~ '^[a-z]{2}(-[A-Z]{2})?$');

comment on column public.profiles.chat_translate_to is
  'Viewer preference for in-chat translation. ISO 639-1 (optionally with '
  'region, e.g. en-GB) for the language incoming messages should be '
  'translated into, or NULL to disable. Set via /api/m/me/chat-translate-pref.';
