-- 0006_maintenance_templates.sql — reusable maintenance template library + enriched schedules.
--
-- Adds:
--   maintenance_templates  — a reusable catalog (e.g. "W202 C180", "Polo 9N 1.4")
--   template_items         — the richly-specified items inside a template
-- Enriches maintenance_schedules (the existing per-vehicle instances) with the same
-- rich fields + a provenance link back to the template item it came from.
--
-- All owner-scoped (user_id default auth.uid(), RLS auth.uid()=user_id) per 0005.
-- Idempotent / safe to re-run. Applied to live on 2026-06-18.

create table if not exists public.maintenance_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  make        text,
  model       text,
  sub_model   text,
  engine_code text,
  notes       text,
  is_builtin  boolean not null default false,
  user_id     uuid not null references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now()
);
alter table public.maintenance_templates enable row level security;

create table if not exists public.template_items (
  id                   uuid primary key default gen_random_uuid(),
  template_id          uuid not null references public.maintenance_templates(id) on delete cascade,
  item                 text not null,
  category             text,
  distance_interval_km numeric,
  time_interval_months numeric,
  priority             integer default 3,            -- 1 highest … 4 lowest
  diy_difficulty       text,                          -- Easy | Moderate | Hard | Pro
  parts_needed         text,                          -- free text (→ structured links in T2)
  consumables_needed   text,
  torque_spec          text,
  warn_threshold_km    numeric,                       -- per-item "due soon" override
  warn_threshold_days  numeric,
  spec_source          text,                          -- e.g. "researched — verify vs manual"
  sort_order           integer default 0,
  user_id              uuid not null references auth.users(id) default auth.uid(),
  created_at           timestamptz not null default now()
);
create index if not exists template_items_template_idx on public.template_items (template_id, sort_order);
alter table public.template_items enable row level security;

-- Enrich the existing per-vehicle schedule table (additive, nullable — no behaviour change).
alter table public.maintenance_schedules
  add column if not exists category            text,
  add column if not exists priority            integer default 3,
  add column if not exists diy_difficulty      text,
  add column if not exists parts_needed        text,
  add column if not exists consumables_needed  text,
  add column if not exists torque_spec         text,
  add column if not exists warn_threshold_km   numeric,
  add column if not exists warn_threshold_days numeric,
  add column if not exists template_item_id    uuid references public.template_items(id) on delete set null;

-- Owner-scoped RLS for the two new tables (drop-then-create for idempotency).
do $$
declare
  t text;
  tables text[] := array['maintenance_templates', 'template_items'];
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
