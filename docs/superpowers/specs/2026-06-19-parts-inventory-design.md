# Stallion Pit — Parts Inventory (T2, slice 1) — Design Spec

**Date:** 2026-06-19
**Status:** Approved for planning
**Tier:** T2 (supporting data), slice 1. Depends on: T0, T1 (done).
**Concurrency note:** another session has the repo at migration 0011 (Feedback) with WIP in
`consumption.js`/`Dashboard.jsx`. This slice uses migration **0012** and stages **only its own files**.

## 1. Purpose
Upgrade the parts log into a light inventory: track OEM and cross-reference numbers, storage
location, warranty, and on-hand stock — so you can answer "do I have one, where is it, is it still
under warranty, what's the OEM/equivalent number?" Work Orders already create parts rows on close,
so this enriches that flow too.

## 2. Goals / non-goals
**Goals**
- Enrich `parts` with OEM number, equivalent/cross-ref numbers, location, warranty, on-hand qty.
- "In stock" status + filter; warranty badge (under warranty / expired).
- Pure, tested warranty calculation.

**Non-goals**
- Stock-movement ledger / auto-decrement on fit (deferred; not "supporting data").
- Receipt/photo attachments → Documents module.
- Changing the Work Order close flow.

## 3. Data model — `supabase/migrations/0012_parts_inventory.sql`
Additive `alter table ... add column if not exists` on `public.parts` (nullable/defaulted; existing
rows and UI unaffected). RLS unchanged (owner-scoped via 0005).
```
oem_number          text
equivalent_numbers  text     -- free-text cross-references / aftermarket equivalents
location            text     -- storage location (shelf/box)
warranty_months     numeric
warranty_until      date     -- explicit, or auto-computed purchased_at + warranty_months
on_hand_qty         numeric  -- units currently on the shelf (manual)
```
`status` gains the value **'In Stock'** (app-enforced list; no DB CHECK exists, so no constraint
change). Existing `'Purchased'` rows keep working and count as available.

## 4. Pure logic — `src/lib/calc/parts.js` (+ `parts.test.js`)
- `computeWarrantyUntil(part)` → returns `warranty_until` if set; else `addMonths(purchased_at,
  warranty_months)` when both present (reuses the T1.1 `addMonths` helper); else null.
- `warrantyStatus(part, today)` → `'active'` if effective warranty-until ≥ today, `'expired'` if
  before today, `null` if no warranty info. (`today` injectable for tests; ISO-date string compare.)
- Tests: stored-date wins; compute from months; none → null; active/expired/boundary(today); cross-
  year via addMonths.

## 5. UI — `src/pages/PartsLog.jsx`
- **Form**: existing fields, plus a collapsible **"Inventory & warranty"** section — OEM number,
  equivalent numbers, location, warranty months, on-hand qty. Status select gains **In Stock**.
  On save, `warranty_until` auto-fills from purchased_at + warranty_months when left blank
  (via `computeWarrantyUntil`).
- **List**: filter tabs **All / In stock / Fitted / Returned** (In stock = status in
  {In Stock, Purchased} and not Returned/Fitted). Warranty badge (Under warranty = green, Expired =
  muted) from `warrantyStatus`. OEM/location shown in the part subline.
- **Stats**: add **In stock** count and **Under warranty** count alongside the existing tiles.
- Conventions: `clean()` `''→null`; existing `lineTotal` unchanged; confirm-before-delete.

## 6. Work breakdown
1. `0012_parts_inventory.sql` — enrich parts; apply live.
2. `src/lib/calc/parts.js` + tests.
3. Enrich `PartsLog.jsx` (form section, filter, warranty badge, stats).
4. build / lint / tests; commit **own files only** (no `git add -A`).

## 7. Risks & mitigations
- **Concurrent session** — never `git add -A`; stage explicit paths
  (migration, parts.js[+test], PartsLog.jsx, this spec). Use migration 0012.
- **Status overlap (Purchased vs In Stock)** — treat both as "available"; no data migration.
- **Warranty date compare** — ISO `YYYY-MM-DD` strings compare lexically; `today` from local date.

## 8. Success criteria
- [ ] `0012` applied live; existing parts unaffected; new fields persist.
- [ ] In-stock filter + warranty badge correct; In stock / Under warranty stats correct.
- [ ] `npm test` passes (incl. new parts tests); build clean; no new lint patterns beyond app-wide
      set-state-in-effect; other session's WIP files untouched.
