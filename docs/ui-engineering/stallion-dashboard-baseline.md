# Stallion Pit UI baseline — Dashboard

Branch: `ui/engineering-v1`

This is the first controlled UI-engineering experiment. It is an audit and implementation brief, not approval to change business logic.

## Scope
Target: `src/pages/Dashboard.jsx`.

Preserve all current calculations, navigation destinations, Supabase reads, active-vehicle behavior, status semantics, and displayed data unless a separate functional change is requested.

## Code-level findings to verify visually

### 1. Three metric-card regions consume substantial vertical space
The dashboard currently uses:
- a fleet overview card grid
- six active-vehicle metric cards
- four month-to-date spend cards

Candidate change: consolidate these into compact summary bands/rows while preserving values and click targets.

### 2. Heading structure repeats framing
The main Dashboard header is followed later by another page-header for the active vehicle, plus separate headings for fuel, alerts, spend, and activity.

Candidate change: reduce repeated title/subtitle chrome and make active-vehicle identity part of one compact toolbar/header.

### 3. Operational exceptions should outrank descriptive metrics
Overdue maintenance and open snags are core action states but appear after several overview sections.

Candidate change: place high/critical snags and overdue/due-soon maintenance above or immediately adjacent to the active vehicle summary.

### 4. Fuel-used table may be too prominent for a small personal fleet
Verify current real-data height at 1440×900.

Candidate change: retain the data but consider a compact fleet strip or secondary section if it displaces maintenance state.

### 5. Existing CSS already contains compact primitives
`.fuel-stats-grid .card` already uses tighter padding and smaller values.

Candidate change: reuse/refine the current design system before introducing new dependencies.

## Acceptance measurements
At 1440×900 compare before vs after:
- Y-coordinate of first actionable maintenance/snag content
- number of meaningful status/metric items visible before scrolling
- number of separate bordered/card regions above the fold
- visible open-snag/maintenance exceptions
- vertical footprint of headers + summary metrics

The redesign succeeds only if information density improves without reducing scanability.

## Implementation sequence
1. Capture baseline screenshot at 1440×900.
2. Record the measurements above.
3. Refactor layout only.
4. Run existing tests/build.
5. Capture after screenshot with the same viewport and data state.
6. Compare measurable results.
7. Check 1024×768 and 390×844 for regressions.
8. Keep changes on the UI branch until reviewed.
