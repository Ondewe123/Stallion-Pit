-- 0021_user_settings.sql — generic per-user key/value settings store.
--
-- Reusable across future preferences; first consumer is the theme toggle
-- (key='theme', value='"dark"'|'"light"' as jsonb). Owner-scoped RLS
-- (0005 pattern). Additive, new table, no existing data touched. Idempotent.

create table if not exists public.user_settings (
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  key        text not null,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_settings enable row level security;

drop policy if exists "owner read settings"   on public.user_settings;
drop policy if exists "owner insert settings" on public.user_settings;
drop policy if exists "owner update settings" on public.user_settings;
drop policy if exists "owner delete settings" on public.user_settings;

create policy "owner read settings"   on public.user_settings for select using (auth.uid() = user_id);
create policy "owner insert settings" on public.user_settings for insert with check (auth.uid() = user_id);
create policy "owner update settings" on public.user_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner delete settings" on public.user_settings for delete using (auth.uid() = user_id);
