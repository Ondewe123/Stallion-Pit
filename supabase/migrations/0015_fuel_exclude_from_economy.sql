-- 0015_fuel_exclude_from_economy.sql
-- Manual anomaly / chain-break flag for fuel economy (feedback #5, and neutralises bad-data rows).
-- Additive; RLS unchanged (owner-scoped via 0005). Existing rows default to included.
alter table public.fuel_logs
  add column if not exists exclude_from_economy boolean not null default false;
