-- 0000_base.sql — foundational tables: vehicles + fuel_logs
--
-- These two tables predate the migration system and existed only in the live
-- Supabase project. This file reverse-engineers their exact live definitions
-- (read from information_schema / pg_get_functiondef on 2026-06-18) so a fresh
-- project can be rebuilt from the repo alone.
--
-- Safe to run on a NEW/empty project. NOT intended to be applied to the current
-- live project, where these objects already exist (everything is guarded with
-- IF NOT EXISTS / OR REPLACE so re-running is harmless either way).
-- Owner-scoped RLS policies are defined later in 0005_owner_rls.sql.

-- ─── vehicles ────────────────────────────────────────────────────────────────
create table if not exists public.vehicles (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  make                 text not null,
  model                text not null,
  sub_model            text,
  year                 integer,
  engine_code          text,
  engine_description   text,
  transmission         text,
  drive_type           text,
  body_type            text,
  fuel_type            text,
  color                text,
  license_plate        text,
  vin                  text,
  purchase_date        date,
  purchase_price_kes   numeric,
  odometer_at_purchase numeric,
  fuel_tank_capacity   numeric,
  oil_capacity_litres  numeric,
  oil_spec             text,
  notes                text,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now()
);

alter table public.vehicles enable row level security;

-- ─── fuel_logs ───────────────────────────────────────────────────────────────
create table if not exists public.fuel_logs (
  id                  uuid primary key default gen_random_uuid(),
  vehicle_id          uuid not null references public.vehicles (id) on delete cascade,
  logged_at           date not null,
  odometer_km         numeric not null,
  volume_litres       numeric,
  total_cost_kes      numeric,
  price_per_litre_kes numeric,
  is_partial          boolean not null default true,
  station             text,
  fuel_grade          text,
  has_additive        boolean not null default false,
  additive_name       text,
  driving_mode        text,
  notes               text,
  -- DB-computed read-only column: rounded cost/volume
  derived_price_per_litre numeric generated always as (
    case
      when volume_litres is not null and volume_litres <> 0
        then round(total_cost_kes / volume_litres, 2)
      else null
    end
  ) stored,
  -- maintained by the trigger below (km gained since the previous fill)
  km_since_last       numeric,
  created_at          timestamptz not null default now()
);

create index if not exists fuel_logs_vehicle_idx     on public.fuel_logs (vehicle_id);
create index if not exists fuel_logs_vehicle_odo_idx on public.fuel_logs (vehicle_id, odometer_km desc);

alter table public.fuel_logs enable row level security;

-- ─── km_since_last trigger ───────────────────────────────────────────────────
-- Sets km_since_last = this odometer minus the highest previous odometer for the
-- same vehicle, on every insert and whenever odometer_km / vehicle_id change.
create or replace function public.fuel_logs_set_km_since_last()
  returns trigger
  language plpgsql
  set search_path to ''
as $function$
begin
  select NEW.odometer_km - max(f.odometer_km)
    into NEW.km_since_last
  from public.fuel_logs f
  where f.vehicle_id = NEW.vehicle_id
    and f.odometer_km < NEW.odometer_km
    and f.id is distinct from NEW.id;
  return NEW;
end;
$function$;

drop trigger if exists fuel_logs_km_since_last on public.fuel_logs;
create trigger fuel_logs_km_since_last
  before insert or update of odometer_km, vehicle_id on public.fuel_logs
  for each row execute function public.fuel_logs_set_km_since_last();
