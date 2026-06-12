-- Module 04: Parts Log
-- Per-vehicle parts purchase / procurement history. Standalone (no service link).
-- Run in Supabase SQL editor (project smellxhfpjyjweledvco), after 0001 is fine too — no dependency.

create table if not exists public.parts (
  id             uuid primary key default gen_random_uuid(),
  vehicle_id     uuid not null references public.vehicles (id) on delete cascade,
  purchased_at   date not null,
  part_name      text not null,
  part_number    text,
  brand          text,
  category       text,
  supplier       text,
  quantity       numeric not null default 1,
  unit_cost_kes  numeric,
  total_cost_kes numeric,           -- = quantity * unit_cost_kes (computed app-side on save)
  odometer_km    integer,
  status         text not null default 'Purchased',  -- Purchased | Fitted | Returned
  notes          text,
  created_at     timestamptz not null default now()
);

create index if not exists parts_vehicle_idx
  on public.parts (vehicle_id);
create index if not exists parts_vehicle_date_idx
  on public.parts (vehicle_id, purchased_at desc);

-- RLS: single-owner app, authenticated users have full access.
alter table public.parts enable row level security;

create policy "authenticated read parts"
  on public.parts for select to authenticated using (true);

create policy "authenticated insert parts"
  on public.parts for insert to authenticated with check (true);

create policy "authenticated update parts"
  on public.parts for update to authenticated using (true) with check (true);

create policy "authenticated delete parts"
  on public.parts for delete to authenticated using (true);
