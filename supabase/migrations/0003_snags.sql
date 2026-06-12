-- Module 09: Snags
-- Per-vehicle issue / fault tracker. Standalone (free-text resolution, no service link).

create table if not exists public.snags (
  id              uuid primary key default gen_random_uuid(),
  vehicle_id      uuid not null references public.vehicles (id) on delete cascade,
  reported_at     date not null,
  title           text not null,
  description     text,
  severity        text not null default 'Medium',  -- Low | Medium | High | Critical
  status          text not null default 'Open',     -- Open | In Progress | Resolved | Won't Fix
  odometer_km     integer,
  resolved_at     date,
  resolution_note text,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists snags_vehicle_idx on public.snags (vehicle_id);
create index if not exists snags_vehicle_date_idx on public.snags (vehicle_id, reported_at desc);

alter table public.snags enable row level security;
create policy "authenticated read snags"   on public.snags for select to authenticated using (true);
create policy "authenticated insert snags" on public.snags for insert to authenticated with check (true);
create policy "authenticated update snags" on public.snags for update to authenticated using (true) with check (true);
create policy "authenticated delete snags" on public.snags for delete to authenticated using (true);
