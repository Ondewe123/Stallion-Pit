-- 0019_vehicle_option_codes.sql - store installed Mercedes/IPC option codes per vehicle.
--
-- Additive only. Vehicles remain owner-scoped by existing user_id + RLS policies.

alter table public.vehicles
  add column if not exists option_codes text[] not null default '{}';
