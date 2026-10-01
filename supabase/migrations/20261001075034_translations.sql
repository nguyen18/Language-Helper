-- Cheatsheet entries made by the `translate` function: one row per word, language and which-dialect
-- version, shared by every user, so each word is translated only once. A new which-dialect version
-- starts fresh rows (old ones can be deleted).
create table public.translations (
  target text not null,          -- TargetLanguage id, e.g. 'vi-Southern' (web/src/lib/languages.ts)
  word text not null,            -- the English word as listed, e.g. 'I''m'
  version text not null,         -- which-dialect version that made it
  entry jsonb not null,          -- { word, meanings, parts? } (supabase/functions/_shared/entries.ts)
  created_at timestamptz not null default now(),
  primary key (target, word, version)
);

-- Only the function (service role, which bypasses RLS) reads and writes it; no policies means the
-- publishable key can't touch it directly.
alter table public.translations enable row level security;
