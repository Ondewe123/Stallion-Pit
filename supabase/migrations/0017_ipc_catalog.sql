-- 0017_ipc_catalog.sql
-- VIN-specific illustrated parts catalog (IPC/EPC) reference data.
-- Dedicated Stallion Pit tables; no shared financial-app tables are altered.

create table if not exists public.ipc_catalogs (
  id                 uuid primary key default gen_random_uuid(),
  vehicle_id         uuid not null references public.vehicles(id) on delete cascade,
  vin                text not null,
  model_code         text,
  engine_code        text,
  gearbox_code       text,
  source_name        text not null default 'ILcats',
  source_file_prefix text,
  notes              text,
  user_id            uuid not null references auth.users(id) default auth.uid(),
  created_at         timestamptz not null default now()
);

create unique index if not exists ipc_catalogs_owner_vin_source_idx
  on public.ipc_catalogs (user_id, vin, source_name);
create index if not exists ipc_catalogs_vehicle_idx
  on public.ipc_catalogs (vehicle_id);
alter table public.ipc_catalogs enable row level security;

create table if not exists public.ipc_diagrams (
  id             uuid primary key default gen_random_uuid(),
  catalog_id     uuid not null references public.ipc_catalogs(id) on delete cascade,
  branch         text not null,
  catalog_group  text not null,
  group_name     text,
  subgroup       text not null,
  diagram_title  text not null,
  part_count     integer not null default 0,
  source_url     text,
  image_url      text,
  user_id        uuid not null references auth.users(id) default auth.uid(),
  created_at     timestamptz not null default now()
);

create unique index if not exists ipc_diagrams_catalog_key_idx
  on public.ipc_diagrams (catalog_id, branch, catalog_group, subgroup);
create index if not exists ipc_diagrams_catalog_group_idx
  on public.ipc_diagrams (catalog_id, catalog_group, subgroup);
alter table public.ipc_diagrams enable row level security;

create table if not exists public.ipc_parts (
  id                  uuid primary key default gen_random_uuid(),
  catalog_id          uuid not null references public.ipc_catalogs(id) on delete cascade,
  diagram_id          uuid references public.ipc_diagrams(id) on delete set null,
  vin                 text not null,
  model_code          text,
  engine_code         text,
  gearbox_code        text,
  branch              text not null,
  catalog_group       text not null,
  group_name          text,
  subgroup            text not null,
  diagram_title       text,
  item_no             text,
  part_number         text not null,
  replacement_numbers text,
  quantity            text,
  name                text not null,
  usage               text,
  remarks             text,
  source_url          text,
  diagram_image_url   text,
  price_url           text,
  user_id             uuid not null references auth.users(id) default auth.uid(),
  created_at          timestamptz not null default now()
);

create index if not exists ipc_parts_catalog_diagram_idx
  on public.ipc_parts (catalog_id, catalog_group, subgroup);
create index if not exists ipc_parts_catalog_part_number_idx
  on public.ipc_parts (catalog_id, part_number);
alter table public.ipc_parts enable row level security;

do $$
declare
  t text;
  tables text[] := array['ipc_catalogs', 'ipc_diagrams', 'ipc_parts'];
begin
  foreach t in array tables loop
    execute format('drop policy if exists "%1$s owner select" on public.%1$I', t);
    execute format('drop policy if exists "%1$s owner insert" on public.%1$I', t);
    execute format('drop policy if exists "%1$s owner update" on public.%1$I', t);
    execute format('drop policy if exists "%1$s owner delete" on public.%1$I', t);
    execute format($f$create policy "%1$s owner select" on public.%1$I for select to authenticated using (auth.uid() = user_id)$f$, t);
    execute format($f$create policy "%1$s owner insert" on public.%1$I for insert to authenticated with check (auth.uid() = user_id)$f$, t);
    execute format($f$create policy "%1$s owner update" on public.%1$I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$f$, t);
    execute format($f$create policy "%1$s owner delete" on public.%1$I for delete to authenticated using (auth.uid() = user_id)$f$, t);
  end loop;
end $$;
