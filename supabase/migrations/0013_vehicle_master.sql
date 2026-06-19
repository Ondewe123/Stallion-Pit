-- 0013_vehicle_master.sql — deepen the vehicle record: extra specs + document renewals.
--
-- Additive only (nullable) — existing vehicles and UI unaffected.
-- Vehicles are already owner-scoped (user_id + RLS from 0005); no policy change.
-- Idempotent. Applied live 2026-06-19.

alter table public.vehicles
  add column if not exists gearbox_code      text,
  add column if not exists tyre_size         text,   -- e.g. 195/65 R15
  add column if not exists battery_spec      text,   -- e.g. 60Ah 540A
  add column if not exists coolant_spec      text,   -- e.g. G12++, MB 325.0
  add column if not exists obd_notes         text,   -- protocol / adapter / port notes
  add column if not exists insurance_expiry  date,
  add column if not exists inspection_expiry date,
  add column if not exists licence_expiry    date,
  add column if not exists insurance_note    text;   -- provider / policy number
