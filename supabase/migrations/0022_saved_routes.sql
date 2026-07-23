-- 0022_saved_routes.sql — Route Cost Planner: saved routes + per-vehicle running cost rate.
--
-- saved_routes stores only addresses/coordinates/distance/duration (from Google) — cost is
-- always computed live from current fuel price + current rolling consumption, never stored.
-- Owner-scoped RLS (0005/0021 pattern). Additive `vehicles` column, no existing data touched.
-- Idempotent.

create table if not exists public.saved_routes (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name                 text not null,
  origin_address       text not null,
  origin_lat           double precision not null,
  origin_lng           double precision not null,
  destination_address  text not null,
  destination_lat      double precision not null,
  destination_lng      double precision not null,
  distance_km          numeric not null,
  duration_min         numeric not null,
  notes                text,
  created_at           timestamptz not null default now()
);

alter table public.saved_routes enable row level security;

drop policy if exists "owner read saved_routes"   on public.saved_routes;
drop policy if exists "owner insert saved_routes" on public.saved_routes;
drop policy if exists "owner update saved_routes" on public.saved_routes;
drop policy if exists "owner delete saved_routes" on public.saved_routes;

create policy "owner read saved_routes"   on public.saved_routes for select using (auth.uid() = user_id);
create policy "owner insert saved_routes" on public.saved_routes for insert with check (auth.uid() = user_id);
create policy "owner update saved_routes" on public.saved_routes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner delete saved_routes" on public.saved_routes for delete using (auth.uid() = user_id);

alter table public.vehicles add column if not exists running_cost_km numeric;
