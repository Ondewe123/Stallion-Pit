alter table public.feedback_reports
  add column if not exists disposition text,
  add column if not exists canonical_report_id uuid references public.feedback_reports(id) on delete set null,
  add column if not exists resolution_note text,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_app_version text;

alter table public.feedback_reports
  drop constraint if exists feedback_reports_disposition_check;
alter table public.feedback_reports
  add constraint feedback_reports_disposition_check
  check (disposition is null or disposition in ('duplicate', 'cannot_reproduce'));

alter table public.feedback_reports
  drop constraint if exists feedback_reports_duplicate_canonical_check;
alter table public.feedback_reports
  add constraint feedback_reports_duplicate_canonical_check
  check (
    (disposition = 'duplicate' and canonical_report_id is not null)
    or (disposition is distinct from 'duplicate' and canonical_report_id is null)
  );

create index if not exists feedback_reports_canonical_report_idx
  on public.feedback_reports (canonical_report_id)
  where canonical_report_id is not null;

grant select, insert, update, delete on public.feedback_reports to authenticated;
revoke all on public.feedback_reports from anon;

drop policy if exists "owner update feedback" on public.feedback_reports;
create policy "owner update feedback"
  on public.feedback_reports for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
