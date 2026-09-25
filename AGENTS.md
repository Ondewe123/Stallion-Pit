# Stallion Pit agent instructions

Stallion Pit is operational vehicle-maintenance software. Preserve business logic, calculations, Supabase behavior, authorization, routing, and data semantics unless a task explicitly changes them.

For material UI creation, redesign, responsive-layout work, dashboard/table/form refactors, or requests to reduce wasted space, load and follow the repo-local `ui-engineering` skill before editing UI.

Primary UI objective: dense, legible operational software. Optimize task throughput, exception visibility, and useful information per viewport before decorative whitespace.

For UI changes:
1. Inspect existing patterns and global CSS first.
2. Preserve current behavior unless change is explicitly requested.
3. Prefer structural improvements over cosmetic churn.
4. Validate at 1440×900 first, then 1024×768 and 390×844 where relevant.
5. Keep significant UI experiments off `main` until reviewed.
