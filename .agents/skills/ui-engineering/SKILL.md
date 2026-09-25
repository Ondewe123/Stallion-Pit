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
Always inspect:
- `src/index.css`
- the target page
- adjacent pages using similar patterns
- `src/components/Layout.jsx`
- existing classes/components before creating new ones

Do not add a new component library merely to redesign a screen.

## Density defaults
For desktop operational screens, start with compact density:
- page horizontal padding: 16–24 px
- major section gap: 16–20 px
- related-control gap: 8–12 px
- contained-section padding: 12–16 px
- controls: 32–36 px high
- dense table rows: 32–40 px
- toolbar: 36–44 px
- page title: 20–28 px
- section heading: 14–18 px
- body text: 13–15 px
- metadata: 11–13 px

Treat 900 px of vertical height as a finite budget. Primary working content should normally begin within roughly 120–150 px of the top after app chrome.

## Hard anti-patterns
Avoid unless domain needs prove otherwise:
- repeated page/section titles
- oversized KPI-card grids
- card-per-metric layouts when a summary strip works
- nested bordered containers
- large decorative icons
- 24px+ spacing repeated through multiple nesting levels
- turning useful tables into cards
- hiding common actions behind menus
- separate pages where a drawer or expandable row better preserves context
- desktop layouts that are stretched mobile layouts

## Preferred Stallion patterns

### Dashboard
Use a compact command/summary band for fleet-wide status. Make alerts, overdue maintenance, and open snags visually dominant. Vehicle operating metrics should use a dense summary strip rather than six independent cards. Keep fuel/spend/activity as compact secondary sections.

### Tables
Prefer tables for recurring records. Right-align comparable numbers/currency. Keep status near record identity. Use sticky headers for long lists. Avoid rows taller than needed.

### Forms
Use two or more columns on desktop when fields are naturally related. Collapse progressively for tablet/mobile. Do not leave short inputs occupying full desktop width without reason.

### Detail
Preserve context with expandable rows, side panels, or drawers for minor detail rather than unnecessary navigation.

## Required visual review
Do not declare a material UI refactor complete from source code alone.

Review rendered output at:
- 1440×900 — primary acceptance viewport
- 1024×768 — tablet landscape
- 390×844 — mobile when supported

For each viewport record:
- where useful content begins
- visible primary actions
- visible records/alerts
- wasted regions
- clipping/overflow
- hierarchy problems

Then fix the highest-impact issues and recapture.

## Review format
For each finding state:
- Problem
- Why it matters
- Change
- Evidence

Prioritize no more than five high-impact findings at a time.

## Completion gate
A material UI change is complete only when:
- functional behavior is preserved
- expected build/tests pass
- no obvious clipping/overflow is introduced
- desktop density matches an operational tool
- alerts/exceptions are easy to find
- responsive behavior is inspected or explicitly scoped out
- rendered output has been visually reviewed


## Stallion capture command
For repeatable rendered review, use:

`npm run ui:capture`

The harness captures 1440×900, 1024×768, and 390×844 plus JSON viewport metrics into `artifacts/ui/`.

Authentication must come from either:
- `UI_STORAGE_STATE`, or
- `UI_AUDIT_EMAIL` + `UI_AUDIT_PASSWORD`.

If Playwright is not available in the working environment, install it without changing the lockfile using `npm install --no-save playwright`, then install Chromium with `npx playwright install chromium`.

Do not commit generated screenshots or credentials.
