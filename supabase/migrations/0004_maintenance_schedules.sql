-- Module 05: Maintenance Schedule
-- Per-vehicle service intervals → computed next-due. Interval + Mark Done model.

create table if not exists public.maintenance_schedules (
  id                   uuid primary key default gen_random_uuid(),
  vehicle_id           uuid not null references public.vehicles (id) on delete cascade,
  item                 text not null,
  distance_interval_km numeric,
  time_interval_months numeric,
  last_done_odometer   numeric,
  last_done_date       date,
  next_due_odometer    numeric,
  next_due_date        date,
  notes                text,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now()
);

create index if not exists maint_vehicle_idx on public.maintenance_schedules (vehicle_id);
create index if not exists maint_vehicle_due_idx on public.maintenance_schedules (vehicle_id, next_due_odometer);

alter table public.maintenance_schedules enable row level security;
create policy "authenticated read maintenance"   on public.maintenance_schedules for select to authenticated using (true);
create policy "authenticated insert maintenance" on public.maintenance_schedules for insert to authenticated with check (true);
create policy "authenticated update maintenance" on public.maintenance_schedules for update to authenticated using (true) with check (true);
create policy "authenticated delete maintenance" on public.maintenance_schedules for delete to authenticated using (true);
