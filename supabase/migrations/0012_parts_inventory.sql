-- 0012_parts_inventory.sql — upgrade the parts log into a light inventory.
--
-- Additive only (nullable/defaulted) — existing parts rows and UI keep working.
-- Parts are already owner-scoped (user_id + RLS from 0005); no policy change.
-- The status value 'In Stock' is app-enforced (no DB CHECK exists), so no constraint change.
-- Idempotent. Applied live 2026-06-19.

alter table public.parts
  add column if not exists oem_number         text,
  add column if not exists equivalent_numbers text,   -- cross-refs / aftermarket equivalents
  add column if not exists location           text,   -- storage location
  add column if not exists warranty_months    numeric,
  add column if not exists warranty_until      date,
  add column if not exists on_hand_qty        numeric;
