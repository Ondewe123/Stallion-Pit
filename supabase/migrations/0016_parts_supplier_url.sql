-- 0016_parts_supplier_url.sql
-- Supplier URL link for parts (consumed by Task 7's form and Task 10's import script).
-- Additive; RLS unchanged (owner-scoped via 0005). Existing rows default to NULL.
alter table public.parts add column if not exists supplier_url text;
