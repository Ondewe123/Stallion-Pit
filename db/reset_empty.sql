-- ============================================================
-- Stallion Pit — EMPTY RESET
-- Wipes ALL vehicle data (vehicles, fuel, service, parts, snags).
-- Your login / auth is NOT touched. Schema stays intact.
-- Use when you want a completely blank database.
-- ============================================================
truncate table public.snags, public.parts, public.maintenance_schedules, public.service_logs, public.fuel_logs, public.vehicles restart identity cascade;
