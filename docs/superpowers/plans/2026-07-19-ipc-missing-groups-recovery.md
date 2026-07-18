# IPC Missing Groups Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover missing ILcats IPC groups after the first browser-console capture stopped around group 54, then upload a complete combined catalog.

**Architecture:** Keep the database schema unchanged. Add a browser-console scraper that runs inside ILcats to export missing diagram and part CSV files, then add a local merge helper that combines those files with the existing partial CSVs before using the existing destructive `scripts/import-ipc.mjs` importer.

**Tech Stack:** Browser console JavaScript, Node.js ESM scripts, Vitest, Supabase service-role import.

## Global Constraints

- Do not change Supabase schema for this recovery.
- Do not upload partial missing rows directly into the live catalog.
- Combine old and recovered CSVs first, then run the existing full-catalog import.
- Preserve existing CSV headers used by `scripts/import-ipc.mjs`.

---

### Task 1: CSV Merge Helper

**Files:**
- Create: `src/lib/ipc/csvMerge.js`
- Create: `src/lib/ipc/csvMerge.test.js`
- Create: `scripts/merge-ipc-csv.mjs`

**Interfaces:**
- Produces: `mergeIpcCsvFiles(inputs)` returning merged `diagramsCsv`, `partsCsv`, and summary counts.

- [ ] Write failing tests for de-duping diagram and part rows.
- [ ] Implement merge helper.
- [ ] Add CLI wrapper.
- [ ] Run focused tests.

### Task 2: ILcats Browser Console Scraper

**Files:**
- Create: `scripts/ilcats-missing-groups-console.js`

**Interfaces:**
- Produces two browser downloads: `ilcats-ADB2020186F450004-missing-diagrams.csv` and `ilcats-ADB2020186F450004-missing-parts.csv`.

- [ ] Add script with configurable VIN/model/catalog/missing group range.
- [ ] Parse diagram links from ILcats pages using same-origin `fetch`.
- [ ] Parse parts from fetched diagram pages into importer-compatible CSV rows.
- [ ] Add progress logging and downloadable output.

### Task 3: Upload Recovered Catalog

**Files:**
- No code changes expected after Task 1 and Task 2.

- [ ] User runs browser-console scraper on ILcats and provides/downloads CSV files into `IPC/`.
- [ ] Run merge CLI to create combined CSVs.
- [ ] Dry-run existing importer.
- [ ] Apply existing importer.
- [ ] Verify Supabase has groups beyond 54 and windscreen/window groups.
