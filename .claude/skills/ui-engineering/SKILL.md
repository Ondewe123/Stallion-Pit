---
name: ui-engineering
description: Review, redesign, refactor, and validate dense professional application UI in Stallion Pit. Use for dashboards, tables, forms, navigation, responsive layouts, screenshot reviews, or requests to reduce wasted space.
---

# Stallion Pit UI Engineering

## Product stance
Stallion Pit is operational software. Optimize in this order:
1. exception visibility
2. task throughput
3. information density
4. hierarchy and scanability
5. responsive behavior
6. consistency
7. polish

Do not optimize first for decorative whitespace.

## Preserve invariants
A UI refactor must not silently alter:
- Supabase queries or persistence
- fuel, distance, maintenance, cost, or status calculations
- authentication/authorization
- route semantics
- record meaning

Separate logic changes from presentation changes.

## Inspect before editing
Always inspect `src/index.css`, the target page, adjacent patterns, `src/components/Layout.jsx`, and existing classes/components before creating new ones. Do not add a component library merely to redesign a screen.

## Density defaults
Use compact desktop defaults:
- page horizontal padding 16–24 px
- major section gap 16–20 px
- related-control gap 8–12 px
- contained-section padding 12–16 px
- controls 32–36 px
- dense table rows 32–40 px
- toolbar 36–44 px
- page title 20–28 px
- section heading 14–18 px
- body 13–15 px
- metadata 11–13 px

Treat 900 px vertical height as a finite budget.

## Avoid
Repeated headers, oversized KPI-card grids, card-per-metric layouts, nested bordered containers, decorative icons, repeated 24px+ padding, replacing useful tables with cards, hiding common actions, unnecessary navigation, and stretched-mobile desktop layouts.

## Preferred patterns
Dashboard: compact summary band; alerts/overdue/open snags dominant; operating metrics in a dense summary strip; fuel/spend/activity secondary.
Tables: compact rows, sticky headers where useful, numeric alignment, status adjacent to identity.
Forms: multi-column desktop layout for related fields, progressive collapse.
Detail: expandable rows, side panels, or drawers when they preserve context.

## Required visual review
Review at 1440×900 first, then 1024×768 and 390×844 where supported. Record where useful content begins, visible primary actions/records/alerts, wasted regions, clipping/overflow, and hierarchy problems. Fix the highest-impact issues and recapture before declaring completion.

## Completion gate
Behavior preserved; build/tests pass; no clipping/overflow; dense desktop layout; exceptions easy to find; responsive behavior checked or explicitly scoped out; rendered result visually reviewed.
