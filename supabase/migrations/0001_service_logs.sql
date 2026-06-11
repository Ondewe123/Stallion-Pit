-- Module 03: Service Log
-- Per-vehicle service / repair history. One row per job.
-- Run in Supabase SQL editor (project smellxhfpjyjweledvco).

create table if not exists public.service_logs (
  id                uuid primary key default gen_random_uuid(),
  vehicle_id        uuid not null references public.vehicles (id) on delete cascade,
  serviced_at       date not null,
  odometer_km       integer,
  category          text not null,
  description       text,
  workshop          text,
  total_cost_kes    numeric not null,
  labour_cost_kes   numeric,
  parts_cost_kes    numeric,
  next_service_note text,
  notes             text,
  created_at        timestamptz not null default now()
);

create index if not exists service_logs_vehicle_idx
  on public.service_logs (vehicle_id);
create index if not exists service_logs_vehicle_date_idx
  on public.service_logs (vehicle_id, serviced_at desc);

-- Row-Level Security: single-owner app, authenticated users have full access.
-- Confirm this matches the policies on vehicles / fuel_logs.
alter table public.service_logs enable row level security;

create policy "authenticated read service_logs"
  on public.service_logs for select to authenticated using (true);

create policy "authenticated insert service_logs"
  on public.service_logs for insert to authenticated with check (true);

create policy "authenticated update service_logs"
  on public.service_logs for update to authenticated using (true) with check (true);

create policy "authenticated delete service_logs"
  on public.service_logs for delete to authenticated using (true);
