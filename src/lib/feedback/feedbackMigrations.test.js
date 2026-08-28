import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migrationUrl = new URL('../../../supabase/migrations/20260828032400_prevent_feedback_self_canonical.sql', import.meta.url)

describe('prevent_feedback_self_canonical migration', () => {
  it('adds a named check that rejects a report canonicalizing to itself', async () => {
    const sql = await readFile(migrationUrl, 'utf8')

    expect(sql).toMatch(/add constraint feedback_reports_canonical_not_self/i)
    expect(sql).toMatch(/check \(canonical_report_id is null or canonical_report_id <> id\)/i)
  })
})
