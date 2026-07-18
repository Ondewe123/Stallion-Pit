# Snag IPC Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make IPC parts easier to attach while adding or editing snags by adding filters and smart ranking from snag details.

**Architecture:** Keep persistence unchanged and improve the existing `snag_ipc_parts` UI. Put ranking/filtering logic in tested helpers under `src/lib/ipc/snagParts.js`, then wire `src/pages/Snags.jsx` to those helpers.

**Tech Stack:** React, Vite, Vitest, Supabase JavaScript client.

## Global Constraints

- Implement A+B now: better picker filters and smart ranked search.
- Defer C: true AI query comes later.
- Do not add a database migration for this pass.
- Preserve the existing ability to attach IPC parts while adding or editing snags.

---

### Task 1: Tested Picker Helpers

**Files:**
- Modify: `src/lib/ipc/snagParts.test.js`
- Modify: `src/lib/ipc/snagParts.js`

**Interfaces:**
- Produces: `rankIpcParts(parts, options)`, `ipcGroupOptions(parts)`, `ipcBranchOptions(parts)`, `ipcDiagramOptions(parts, filters)`, `groupLabel(code, sourceName)`.

- [ ] **Step 1: Write failing tests**
- [ ] **Step 2: Run `npm.cmd test -- src/lib/ipc/snagParts.test.js` and verify the new tests fail**
- [ ] **Step 3: Implement helper logic**
- [ ] **Step 4: Re-run the focused test and verify it passes**

### Task 2: Snags Form Picker UI

**Files:**
- Modify: `src/pages/Snags.jsx`

**Interfaces:**
- Consumes: helper functions from Task 1.

- [ ] **Step 1: Fetch IPC metadata needed by filters**
- [ ] **Step 2: Replace the 8-row plain search with search, smart ranking, group, branch, and diagram filters**
- [ ] **Step 3: Keep selected part quantities and removal working**
- [ ] **Step 4: Verify the edit form shows attached IPC parts**

### Task 3: Verify And Publish

**Files:**
- No source edits expected.

- [ ] **Step 1: Run focused tests**
- [ ] **Step 2: Run full tests or build**
- [ ] **Step 3: Commit and push to `origin/main` for Vercel**
