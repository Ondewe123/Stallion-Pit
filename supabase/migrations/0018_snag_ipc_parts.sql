-- 0018_snag_ipc_parts.sql
-- Link snags to one or more IPC catalog parts, and preserve IPC provenance on job parts.

create table if not exists public.snag_ipc_parts (
  id              uuid primary key default gen_random_uuid(),
  snag_id         uuid not null references public.snags(id) on delete cascade,
  ipc_part_id     uuid not null references public.ipc_parts(id) on delete cascade,
  quantity_needed numeric not null default 1,
  note            text,
  user_id         uuid not null references auth.users(id) default auth.uid(),
  created_at      timestamptz not null default now()
);

create unique index if not exists snag_ipc_parts_unique_idx
  on public.snag_ipc_parts (snag_id, ipc_part_id);
create index if not exists snag_ipc_parts_snag_idx
  on public.snag_ipc_parts (snag_id);
create index if not exists snag_ipc_parts_ipc_part_idx
  on public.snag_ipc_parts (ipc_part_id);
alter table public.snag_ipc_parts enable row level security;

drop policy if exists "snag_ipc_parts owner select" on public.snag_ipc_parts;
drop policy if exists "snag_ipc_parts owner insert" on public.snag_ipc_parts;
drop policy if exists "snag_ipc_parts owner update" on public.snag_ipc_parts;
drop policy if exists "snag_ipc_parts owner delete" on public.snag_ipc_parts;
create policy "snag_ipc_parts owner select" on public.snag_ipc_parts for select to authenticated using ((select auth.uid()) = user_id);
create policy "snag_ipc_parts owner insert" on public.snag_ipc_parts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "snag_ipc_parts owner update" on public.snag_ipc_parts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "snag_ipc_parts owner delete" on public.snag_ipc_parts for delete to authenticated using ((select auth.uid()) = user_id);

alter table public.work_order_parts
  add column if not exists ipc_part_id uuid references public.ipc_parts(id) on delete set null;

create index if not exists work_order_parts_ipc_part_idx
  on public.work_order_parts (ipc_part_id);

alter table public.parts
  add column if not exists ipc_part_id uuid references public.ipc_parts(id) on delete set null;

create index if not exists parts_ipc_part_idx
  on public.parts (ipc_part_id);
