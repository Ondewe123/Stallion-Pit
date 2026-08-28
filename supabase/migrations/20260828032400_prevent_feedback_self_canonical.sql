do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.feedback_reports'::regclass
      and conname = 'feedback_reports_canonical_not_self'
  ) then
    alter table public.feedback_reports
      add constraint feedback_reports_canonical_not_self
      check (canonical_report_id is null or canonical_report_id <> id);
  end if;
end
$$;
