# Task 1 report — Add Feedback Triage Metadata Safely

## Implementation

Created the additive migration:

`supabase/migrations/20260828002325837_feedback_triage_metadata.sql`

It adds the five nullable triage metadata columns, the two disposition/canonical-reference checks, a partial canonical-reference index, explicit authenticated table grants, an anon revoke, and the owner-scoped authenticated update policy with both `USING` and `WITH CHECK`.

The required Supabase CLI generator commands were attempted. They could not run in this environment: `npx` failed because `C:\Users\Chris\AppData\Roaming\npm\node_modules\npm\bin\npx-cli.js` is missing; the `npx.cmd` fallback produced no usable CLI output. Therefore the migration filename was created using the current timestamp convention, and this limitation is recorded rather than claimed as a successful generator run.

## Checks and outputs

- Migration path discovery: exactly one matching file was found:
  `D:\stallion-pit\.worktrees\feedback-audit-cleanup\supabase\migrations\20260828002325837_feedback_triage_metadata.sql`
- `Get-Content $feedbackMigrationPath`: showed only the requested additive columns, constraints, index, grants/revoke, and update-policy replacement.
- `rg -n "service_role|security definer|auth\.role\(\)|grant .* anon" $feedbackMigrationPath`: no matches (exit 1, expected no matches).
- `git diff --check -- $feedbackMigrationPath`: exit 0.
- Static review confirmed `resolution_note` is nullable and no database-level evidence requirement was added.

## Supabase guidance review

Reviewed on 2026-08-28:

- [Supabase Row Level Security guide](https://supabase.com/docs/guides/database/postgres/row-level-security): Data API grants and RLS are separate; UPDATE needs a corresponding SELECT policy and uses both `USING` and `WITH CHECK`.
- [Supabase Data API auto-exposure changelog](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically): explicit grants are required for affected projects, while existing explicitly granted tables remain reachable; this migration keeps the authenticated grant explicit and revokes anon.

No breaking change identified that blocks adding columns to this existing table or exposing those columns through the Data API under its explicit grants.

## Files changed

- `supabase/migrations/20260828002325837_feedback_triage_metadata.sql`
- `.superpowers/sdd/2026-08-27-feedback-audit-backlog-cleanup/task-1-report.md`

## Self-review

- SQL matches the task brief verbatim.
- All five new columns are nullable.
- Duplicate dispositions require a canonical report; non-duplicate dispositions require no canonical report.
- The replacement update policy is owner-scoped and protects both existing and resulting `user_id` values.
- No application files, roadmap files, or production configuration were modified.

## Skipped live-only checks and concerns

Per controller ruling, no preview Supabase database is configured. The migration was not applied to production, and no schema inspection queries, rolled-back constraint transactions, or Supabase database security/performance advisors were run. Consequently, live column/policy/grant results and runtime constraint behavior remain to be verified by Task 5 against a configured non-production target. The CLI generator failure above is also a tooling concern; the migration content itself passed static review.

## Fix round 1 — CLI generator reattempt (2026-08-28)

The reviewer-required bundled entrypoint was invoked exactly:

```powershell
node "C:\Program Files\nodejs\node_modules\npm\bin\npx-cli.js" --yes supabase migration new feedback_triage_metadata
```

It was run both sandboxed and with escalated network permission. Both attempts produced no CLI output and created no `*_feedback_triage_metadata.sql` file. The same behavior occurred for:

```powershell
node "C:\Program Files\nodejs\node_modules\npm\bin\npx-cli.js" --yes supabase --version
npm.cmd exec --yes --package=@supabase/cli -- supabase --version
npm.cmd exec --yes --package cowsay -- cowsay hi
```

The direct `npx.cmd` invocation also failed earlier because it resolves the missing `C:\Users\Chris\AppData\Roaming\npm\node_modules\npm\bin\npx-cli.js`. The official CLI was subsequently located at `E:\npm-cache\_npx\b96a6bd565c470ce\node_modules\@supabase\cli-windows-x64\bin\supabase.exe`.

## Fix round 1 — official CLI generation completed (2026-08-28)

After confirming the binary, the exact command was run from the worktree:

```powershell
& 'E:\npm-cache\_npx\b96a6bd565c470ce\node_modules\@supabase\cli-windows-x64\bin\supabase.exe' migration new feedback_triage_metadata
```

Exact output:

```text
{"path":"D:\\stallion-pit\\.worktrees\\feedback-audit-cleanup\\supabase\\migrations\\20260827213725_feedback_triage_metadata.sql","message":"Migration created"}
```

Only after that path was confirmed, the manually named migration was removed and the reviewed SQL was placed into the CLI-generated file with `apply_patch`. Focused checks were rerun: one matching migration path (`20260827213725_feedback_triage_metadata.sql`), prohibited-pattern scan returned no matches (`RG_EXIT=1`), and `git diff --check` returned 0. `supabase/config.toml` is absent in this checkout, so no local Supabase test target or migration application was attempted. No database was touched.
