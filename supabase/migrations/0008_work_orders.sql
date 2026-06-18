-- 0008_work_orders.sql — job-card workflow.
--
-- work_orders                — lifecycle entity (Open→In Progress→Closed/Cancelled) per vehicle
-- work_order_parts           — planned/fitted parts line items (→ parts table on close)
-- work_order_schedule_items  — join: schedule items this WO services (→ marked done on close)
-- + link-back columns on snags / parts / service_logs.
--
-- On close (app-side, see src/lib/calc/workorders.js) a WO writes ONE labour-only service_logs
-- row, one parts row per fitted line, completes linked schedule items and resolves linked snags —
-- so Dashboard/Analysis spend stays correct with no double-counting.
--
-- Owner-scoped RLS (0005/0006 pattern). Idempotent. Applied live 2026-06-18.

create table if not exists public.work_orders (
  id                uuid primary key default gen_random_uuid(),
  vehicle_id        uuid not null references public.vehicles(id) on delete cascade,
  title             text not null,
  status            text not null default 'Open',     -- Open | In Progress | Closed | Cancelled
  opened_at         date not null default current_date,
  target_date       date,
  completed_at      date,
  odometer_km       numeric,
  category          text,
  workshop          text,
  labour_hours      numeric,
  labour_cost_kes   numeric,
  completion_notes  text,
  test_drive_result text,
  dtc_notes         text,
  closed_by         text,
  service_log_id    uuid references public.service_logs(id) on delete set null,
  user_id           uuid not null references auth.users(id) default auth.uid(),
  created_at        timestamptz not null default now()
);
create index if not exists work_orders_vehicle_idx on public.work_orders (vehicle_id, opened_at desc);
alter table public.work_orders enable row level security;

create table if not exists public.work_order_parts (
  id             uuid primary key default gen_random_uuid(),
  work_order_id  uuid not null references public.work_orders(id) on delete cascade,
  part_name      text not null,
  part_number    text,
  brand          text,
  status         text not null default 'Planned',     -- Planned | Fitted
  quantity       numeric not null default 1,
  unit_cost_kes  numeric,
  total_cost_kes numeric,
  parts_id       uuid references public.parts(id) on delete set null,
  user_id        uuid not null references auth.users(id) default auth.uid(),
  created_at     timestamptz not null default now()
);
create index if not exists work_order_parts_wo_idx on public.work_order_parts (work_order_id);
alter table public.work_order_parts enable row level security;

create table if not exists public.work_order_schedule_items (
  id                      uuid primary key default gen_random_uuid(),
  work_order_id           uuid not null references public.work_orders(id) on delete cascade,
  maintenance_schedule_id uuid not null references public.maintenance_schedules(id) on delete cascade,
  user_id                 uuid not null references auth.users(id) default auth.uid(),
  created_at              timestamptz not null default now()
);
create index if not exists work_order_sched_wo_idx on public.work_order_schedule_items (work_order_id);
alter table public.work_order_schedule_items enable row level security;

-- link-backs (additive)
alter table public.snags        add column if not exists work_order_id uuid references public.work_orders(id) on delete set null;
alter table public.parts        add column if not exists work_order_id uuid references public.work_orders(id) on delete set null;
alter table public.service_logs add column if not exists work_order_id uuid references public.work_orders(id) on delete set null;

-- owner-scoped RLS for the 3 new tables
do $$
declare
  t text;
  tables text[] := array['work_orders', 'work_order_parts', 'work_order_schedule_items'];
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
