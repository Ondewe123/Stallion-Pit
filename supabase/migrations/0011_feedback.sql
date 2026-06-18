-- 0011_feedback.sql — in-app feedback & capture reports.
--
-- One row per bug/error/idea captured from the floating in-app widget: a typed
-- comment, a frozen breadcrumb trail (jsonb), a context snapshot (jsonb), and a
-- pointer to a screenshot stored in the private `feedback-screenshots` bucket.
-- Owner-scoped RLS (0005 pattern). Idempotent. Apply live via MCP.

create table if not exists public.feedback_reports (
  id              uuid primary key default gen_random_uuid(),
  type            text not null default 'bug'
                    check (type in ('bug','error','idea')),
  status          text not null default 'open'
                    check (status in ('open','in_progress','resolved')),
  comment         text,
  screenshot_path text,
  breadcrumbs     jsonb not null default '[]'::jsonb,
  context         jsonb not null default '{}'::jsonb,
  page_url        text,
  user_id         uuid not null references auth.users(id) default auth.uid(),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);
create index if not exists feedback_reports_status_idx
  on public.feedback_reports (status, created_at desc);

alter table public.feedback_reports enable row level security;

-- Owner-scoped policies (drop-then-create so the migration is re-runnable).
drop policy if exists "owner read feedback"   on public.feedback_reports;
drop policy if exists "owner insert feedback" on public.feedback_reports;
drop policy if exists "owner update feedback" on public.feedback_reports;
drop policy if exists "owner delete feedback" on public.feedback_reports;
create policy "owner read feedback"   on public.feedback_reports for select using (auth.uid() = user_id);
create policy "owner insert feedback" on public.feedback_reports for insert with check (auth.uid() = user_id);
create policy "owner update feedback" on public.feedback_reports for update using (auth.uid() = user_id);
create policy "owner delete feedback" on public.feedback_reports for delete using (auth.uid() = user_id);

-- Private screenshot bucket; objects keyed by `{user_id}/{report_id}.png`.
insert into storage.buckets (id, name, public)
values ('feedback-screenshots', 'feedback-screenshots', false)
on conflict (id) do nothing;

-- Storage policies: a user may only touch objects under their own uid folder.
drop policy if exists "owner read feedback shots"   on storage.objects;
drop policy if exists "owner write feedback shots"  on storage.objects;
drop policy if exists "owner update feedback shots" on storage.objects;
drop policy if exists "owner delete feedback shots" on storage.objects;
create policy "owner read feedback shots" on storage.objects for select
  using (bucket_id = 'feedback-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner write feedback shots" on storage.objects for insert
  with check (bucket_id = 'feedback-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner update feedback shots" on storage.objects for update
  using (bucket_id = 'feedback-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner delete feedback shots" on storage.objects for delete
  using (bucket_id = 'feedback-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
