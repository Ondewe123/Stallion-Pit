-- 0010_dtc_codes.sql — diagnostic trouble code (DTC) log.
--
-- Separate from snags: each scan-tool reading with its type (pending/stored/permanent),
-- freeze-frame, clear + return history, linkable to a snag and a work order.
-- Owner-scoped RLS (0005 pattern). Idempotent. Applied live 2026-06-18.

create table if not exists public.dtc_codes (
  id                uuid primary key default gen_random_uuid(),
  vehicle_id        uuid not null references public.vehicles(id) on delete cascade,
  logged_at         date not null default current_date,
  code              text not null,
  description       text,
  module            text,
  scanner           text,
  code_state        text default 'Stored',      -- Pending | Stored | Permanent
  freeze_frame      text,
  odometer_km       numeric,
  cleared           boolean default false,
  cleared_at        date,
  returned          boolean default false,
  returned_at       date,
  returned_odometer numeric,
  snag_id           uuid references public.snags(id) on delete set null,
  work_order_id     uuid references public.work_orders(id) on delete set null,
  notes             text,
  user_id           uuid not null references auth.users(id) default auth.uid(),
  created_at        timestamptz not null default now()
);
create index if not exists dtc_codes_vehicle_idx on public.dtc_codes (vehicle_id, logged_at desc);
alter table public.dtc_codes enable row level security;

do $$
begin
  execute 'drop policy if exists "dtc_codes owner select" on public.dtc_codes';
  execute 'drop policy if exists "dtc_codes owner insert" on public.dtc_codes';
  execute 'drop policy if exists "dtc_codes owner update" on public.dtc_codes';
  execute 'drop policy if exists "dtc_codes owner delete" on public.dtc_codes';
  execute 'create policy "dtc_codes owner select" on public.dtc_codes for select to authenticated using (auth.uid() = user_id)';
  execute 'create policy "dtc_codes owner insert" on public.dtc_codes for insert to authenticated with check (auth.uid() = user_id)';
  execute 'create policy "dtc_codes owner update" on public.dtc_codes for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)';
  execute 'create policy "dtc_codes owner delete" on public.dtc_codes for delete to authenticated using (auth.uid() = user_id)';
end $$;
