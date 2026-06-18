-- 0009_snags_defect_control.sql — enrich snags into a defect / rectification log.
--
-- Additive only (all nullable/defaulted) — existing snags and the current UI keep working.
-- Snags are already owner-scoped (user_id + RLS from 0005); no policy change needed.
-- Idempotent. Applied live 2026-06-18.

alter table public.snags
  add column if not exists symptom             text,
  add column if not exists conditions          text[],   -- multi-select: {Cold start, Under load, …}
  add column if not exists safety_impact       text,     -- None | Cosmetic | Affects safety | Unsafe to drive
  add column if not exists drivability_impact  text,     -- None | Minor | Noticeable | Severe
  add column if not exists suspected_system    text,
  add column if not exists root_cause          text,
  add column if not exists corrective_action   text,
  add column if not exists verification_method text,
  add column if not exists is_recurring        boolean default false;
