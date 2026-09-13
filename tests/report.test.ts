import { describe, it, expect } from 'vitest'
import { mkdirSync, rmSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildReport, writeReport } from '../src/main/report'

describe('report', () => {
  it('totals', () => {
    const r = buildReport('2026-01-01T00:00:00.000Z', '2026-01-01T00:01:00.000Z', 'debug', [
      { phone: '096', filename: 'a.jpg', status: 'sent' },
      { phone: '097', filename: 'b.jpg', status: 'failed' },
      { phone: '098', filename: 'c.jpg', status: 'sent' }
    ])
    expect(r.totals.sent).toBe(2)
    expect(r.totals.failed).toBe(1)
    expect(r.totals.total).toBe(3)
  })

  it('writes json and csv', () => {
    const dir = join(tmpdir(), `zalo-report-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    const report = buildReport('2026-01-02T00:00:00.000Z', '2026-01-02T00:01:00.000Z', 'auto', [
      { phone: '096', filename: 'a.jpg', status: 'sent' }
    ])
    const out = writeReport(dir, report)
    const j = JSON.parse(readFileSync(out.jsonPath, 'utf-8'))
    expect(j.items).toHaveLength(1)
    const csv = readFileSync(out.csvPath, 'utf-8')
    expect(csv).toContain('phone,filename,status,detail')
    expect(csv).toContain('096')
    rmSync(dir, { recursive: true, force: true })
  })
})
