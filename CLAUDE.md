# Stallion Pit Claude Code instructions

Stallion Pit is operational vehicle-maintenance software. Preserve business logic, calculations, Supabase behavior, authorization, routing, and data semantics unless a task explicitly changes them.

For material UI work, use the repo-local `ui-engineering` skill before implementation.

Design for dense professional software, not a generic marketing/SaaS aesthetic. Prefer useful information per viewport, visible exceptions, compact tables, restrained spacing, and consistent hierarchy. Do not equate "clean" with large empty areas.

For UI work:
1. Inspect neighboring screens and `src/index.css`.
2. Keep functional behavior invariant unless explicitly changing it.
3. Audit rendered output at 1440×900 first.
4. Inspect tablet/mobile where the route supports them.
5. Report measurable changes rather than aesthetic adjectives.
