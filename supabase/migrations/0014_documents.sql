-- 0014_documents.sql — central document library (receipts, invoices, logbook, photos).
--
-- One row per uploaded file, scoped to a vehicle, optionally linked to a work order /
-- part / service / snag. Files live in the private `documents` bucket keyed by
-- `{user_id}/{id}.{ext}`. Owner-scoped RLS + owner-folder Storage policies (same pattern
-- as 0011 feedback-screenshots). Idempotent. Applied live 2026-06-19.

create table if not exists public.documents (
  id             uuid primary key default gen_random_uuid(),
  vehicle_id     uuid not null references public.vehicles(id) on delete cascade,
  file_path      text not null,
  file_name      text not null,
  mime_type      text,
  file_size      numeric,
  kind           text not null default 'Other'
                   check (kind in ('Receipt','Invoice','Logbook','Insurance','Inspection','Photo','Other')),
  title          text,
  note           text,
  work_order_id  uuid references public.work_orders(id)  on delete set null,
  part_id        uuid references public.parts(id)        on delete set null,
  service_log_id uuid references public.service_logs(id) on delete set null,
  snag_id        uuid references public.snags(id)        on delete set null,
  user_id        uuid not null references auth.users(id) default auth.uid(),
  created_at     timestamptz not null default now()
);
create index if not exists documents_vehicle_idx on public.documents (vehicle_id, created_at desc);
alter table public.documents enable row level security;

drop policy if exists "documents owner select" on public.documents;
drop policy if exists "documents owner insert" on public.documents;
drop policy if exists "documents owner update" on public.documents;
drop policy if exists "documents owner delete" on public.documents;
create policy "documents owner select" on public.documents for select to authenticated using (auth.uid() = user_id);
create policy "documents owner insert" on public.documents for insert to authenticated with check (auth.uid() = user_id);
create policy "documents owner update" on public.documents for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "documents owner delete" on public.documents for delete to authenticated using (auth.uid() = user_id);

-- Private bucket; objects keyed by `{user_id}/{document_id}.{ext}`.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "owner read documents"   on storage.objects;
drop policy if exists "owner write documents"  on storage.objects;
drop policy if exists "owner update documents" on storage.objects;
drop policy if exists "owner delete documents" on storage.objects;
create policy "owner read documents" on storage.objects for select
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner write documents" on storage.objects for insert
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner update documents" on storage.objects for update
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner delete documents" on storage.objects for delete
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
