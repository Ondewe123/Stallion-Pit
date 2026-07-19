-- 0020_part_price_snapshots.sql
-- Supplier price history for IPC parts linked to snags.

create table if not exists public.part_price_snapshots (
  id                      uuid primary key default gen_random_uuid(),
  snag_id                 uuid not null references public.snags(id) on delete cascade,
  ipc_part_id             uuid not null references public.ipc_parts(id) on delete cascade,
  user_id                 uuid not null references auth.users(id) default auth.uid(),
  supplier                text not null,
  searched_part_number    text,
  product_title           text,
  brand                   text,
  supplier_article_number text,
  product_url             text,
  image_url               text,
  price                   numeric,
  currency_code           text,
  freight_provider        text,
  freight_method          text,
  freight_weight_kg       numeric,
  freight_cost            numeric,
  freight_currency_code   text,
  fx_rate_to_kes          numeric,
  landed_cost_kes         numeric,
  raw                     jsonb not null default '{}'::jsonb,
  fetched_at              timestamptz not null default now(),
  created_at              timestamptz not null default now()
);

create index if not exists part_price_snapshots_snag_idx
  on public.part_price_snapshots (snag_id, fetched_at desc);
create index if not exists part_price_snapshots_ipc_part_idx
  on public.part_price_snapshots (ipc_part_id, fetched_at desc);
create index if not exists part_price_snapshots_user_idx
  on public.part_price_snapshots (user_id, fetched_at desc);

alter table public.part_price_snapshots enable row level security;

grant select, insert, update, delete on public.part_price_snapshots to authenticated;

drop policy if exists "part_price_snapshots owner select" on public.part_price_snapshots;
drop policy if exists "part_price_snapshots owner insert" on public.part_price_snapshots;
drop policy if exists "part_price_snapshots owner update" on public.part_price_snapshots;
drop policy if exists "part_price_snapshots owner delete" on public.part_price_snapshots;

create policy "part_price_snapshots owner select"
  on public.part_price_snapshots for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "part_price_snapshots owner insert"
  on public.part_price_snapshots for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "part_price_snapshots owner update"
  on public.part_price_snapshots for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "part_price_snapshots owner delete"
  on public.part_price_snapshots for delete to authenticated
  using ((select auth.uid()) = user_id);
