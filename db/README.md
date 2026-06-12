# Database reset / restore

Two version-controlled SQL files let you snap the database back to a known state at any time.
Neither touches your **login / auth** — only the data tables (`vehicles`, `fuel_logs`,
`service_logs`, `parts`, `snags`).

| File | Effect |
|---|---|
| `seed_golden.sql` | **Restore to the clean imported state** — truncates all data, re-inserts the full aCar history (2 vehicles, 369 fuel logs, 56 services) with fixed IDs. Identical every run. |
| `reset_empty.sql` | **Wipe to empty** — truncates all data, inserts nothing. Blank database. |

## How to run

**Easiest:** ask Claude — "reset to golden" or "wipe the database" — and it runs the file via the
Supabase connection.

**Manually (Supabase SQL editor):** open the SQL editor for project `mwakgpzcqoalxtvqucki`,
paste the file's contents, Run.

## Regenerating the golden seed

`seed_golden.sql` is generated from the aCar backup by:

```
node scripts/import-acar.mjs
```

Re-run that if the source backup changes or the schema/mapping is updated. It rewrites
`seed_golden.sql` and does **not** touch the database.
