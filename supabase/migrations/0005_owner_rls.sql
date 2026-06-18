-- 0005_owner_rls.sql — lock every data table to its owning account.
--
-- Before: all six tables had permissive policies (USING(true)) — any authenticated
-- user could read/write every row. Combined with the committed anon key, that meant
-- anyone who signed up would see all data.
--
-- After: each row carries user_id, defaulted to auth.uid() so inserts auto-stamp the
-- owner (no application code change required), and every policy is scoped to
-- auth.uid() = user_id. A stranger who signs up sees an empty app.
--
-- Idempotent / safe to re-run. Applied to the live project on 2026-06-18.

-- The owner of all pre-existing data (chris.odeny@gmail.com).
-- Resolved from: select id from auth.users where email = 'chris.odeny@gmail.com';
do $$
declare
  owner_uuid uuid := '3563089a-faec-4143-8b6e-34fd7ca2d5ec';
  t text;
  tables text[] := array['vehicles','fuel_logs','service_logs','parts','snags','maintenance_schedules'];
begin
  foreach t in array tables loop
    -- 1. add ownership column, defaulting to the current user on insert
    execute format(
      'alter table public.%I add column if not exists user_id uuid references auth.users(id) default auth.uid()',
      t);

    -- 2. backfill existing rows to the owner
    execute format('update public.%I set user_id = %L where user_id is null', t, owner_uuid);

    -- 3. enforce not-null now that every row has an owner
    execute format('alter table public.%I alter column user_id set not null', t);

    -- 4. ensure RLS is on
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- 5. replace the old permissive policies with owner-scoped ones.
-- Old policy names follow the pattern: "authenticated <read|insert|update|delete> <suffix>".

-- vehicles
drop policy if exists "authenticated read vehicles"   on public.vehicles;
drop policy if exists "authenticated insert vehicles"  on public.vehicles;
drop policy if exists "authenticated update vehicles"  on public.vehicles;
drop policy if exists "authenticated delete vehicles"  on public.vehicles;
-- fuel_logs
drop policy if exists "authenticated read fuel_logs"   on public.fuel_logs;
drop policy if exists "authenticated insert fuel_logs" on public.fuel_logs;
drop policy if exists "authenticated update fuel_logs" on public.fuel_logs;
drop policy if exists "authenticated delete fuel_logs" on public.fuel_logs;
-- service_logs
drop policy if exists "authenticated read service_logs"   on public.service_logs;
drop policy if exists "authenticated insert service_logs" on public.service_logs;
drop policy if exists "authenticated update service_logs" on public.service_logs;
drop policy if exists "authenticated delete service_logs" on public.service_logs;
-- parts
drop policy if exists "authenticated read parts"   on public.parts;
drop policy if exists "authenticated insert parts" on public.parts;
drop policy if exists "authenticated update parts" on public.parts;
drop policy if exists "authenticated delete parts" on public.parts;
-- snags
drop policy if exists "authenticated read snags"   on public.snags;
drop policy if exists "authenticated insert snags" on public.snags;
drop policy if exists "authenticated update snags" on public.snags;
drop policy if exists "authenticated delete snags" on public.snags;
-- maintenance_schedules
drop policy if exists "authenticated read maintenance"   on public.maintenance_schedules;
drop policy if exists "authenticated insert maintenance" on public.maintenance_schedules;
drop policy if exists "authenticated update maintenance" on public.maintenance_schedules;
drop policy if exists "authenticated delete maintenance" on public.maintenance_schedules;

-- Create owner-scoped policies for every table.
do $$
declare
  t text;
  tables text[] := array['vehicles','fuel_logs','service_logs','parts','snags','maintenance_schedules'];
begin
  foreach t in array tables loop
    execute format($f$create policy "%1$s owner select" on public.%1$I
      for select to authenticated using (auth.uid() = user_id)$f$, t);
    execute format($f$create policy "%1$s owner insert" on public.%1$I
      for insert to authenticated with check (auth.uid() = user_id)$f$, t);
    execute format($f$create policy "%1$s owner update" on public.%1$I
      for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$f$, t);
    execute format($f$create policy "%1$s owner delete" on public.%1$I
      for delete to authenticated using (auth.uid() = user_id)$f$, t);
  end loop;
end $$;
