import { mkdirSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import type { RunReport, RecordStatus } from '../shared/types'

export function buildReport(
  startedAt: string,
  finishedAt: string,
  mode: RunReport['mode'],
  items: RunReport['items']
): RunReport {
  const totals: Record<RecordStatus | 'total', number> = {
    sent: 0,
    skipped: 0,
    failed: 0,
    not_found: 0,
    rejected: 0,
    total: items.length
  }
  for (const it of items) totals[it.status] = (totals[it.status] ?? 0) + 1
  return { startedAt, finishedAt, mode, totals, items }
}

export function writeReport(userDataDir: string, report: RunReport): { jsonPath: string; csvPath: string } {
  const dir = join(userDataDir, 'reports')
  mkdirSync(dir, { recursive: true })
  const ts = report.startedAt.replace(/[:.]/g, '-')
  const base = `run-${ts}`
  const jsonPath = join(dir, `${base}.json`)
  const csvPath = join(dir, `${base}.csv`)

  const jsonTmp = `${jsonPath}.tmp`
  writeFileSync(jsonTmp, JSON.stringify(report, null, 2), 'utf-8')
  try {
    renameSync(jsonTmp, jsonPath)
  } catch {
    writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  }

  const header = 'phone,filename,status,detail'
  const rows = report.items.map((it) => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    return `${esc(it.phone)},${esc(it.filename)},${esc(it.status)},${esc(it.detail ?? '')}`
  })
  const csv = [header, ...rows].join('\n')
  const csvTmp = `${csvPath}.tmp`
  writeFileSync(csvTmp, csv, 'utf-8')
  try {
    renameSync(csvTmp, csvPath)
  } catch {
    writeFileSync(csvPath, csv, 'utf-8')
  }

  return { jsonPath, csvPath }
}
