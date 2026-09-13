import { createHash } from 'crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import type { HistoryRecord } from '../shared/types'

export function computeKey(filename: string, contentHash: string): string {
  return `${filename}::${contentHash}`
}

export function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256')
    const s = createReadStream(path)
    s.on('data', (d) => h.update(d))
    s.on('error', reject)
    s.on('end', () => resolve(h.digest('hex')))
  })
}

interface HistoryFile {
  version: number
  records: HistoryRecord[]
}

export class HistoryStore {
  private records: HistoryRecord[] = []
  private sentKeys = new Set<string>()
  private filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
  }

  load(): void {
    if (!existsSync(this.filePath)) {
      this.records = []
      this.sentKeys.clear()
      return
    }
    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as HistoryFile
      if (!parsed.records || !Array.isArray(parsed.records)) {
        this.records = []
        this.sentKeys.clear()
        return
      }
      this.records = parsed.records
      this.sentKeys = new Set(this.records.filter((r) => r.status === 'sent').map((r) => r.key))
    } catch {
      this.records = []
      this.sentKeys.clear()
    }
  }

  hasSent(key: string): boolean {
    return this.sentKeys.has(key)
  }

  add(record: HistoryRecord): void {
    this.records.push(record)
    if (record.status === 'sent') this.sentKeys.add(record.key)
    this.flush()
  }

  all(): HistoryRecord[] {
    return [...this.records]
  }

  flush(): void {
    const dir = join(this.filePath, '..')
    mkdirSync(dir, { recursive: true })
    const payload: HistoryFile = { version: 1, records: this.records }
    const tmp = `${this.filePath}.tmp`
    writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf-8')
    try {
      renameSync(tmp, this.filePath)
    } catch {
      writeFileSync(this.filePath, JSON.stringify(payload, null, 2), 'utf-8')
    }
  }
}

export function openStore(userDataDir: string): HistoryStore {
  const p = join(userDataDir, 'history.json')
  const store = new HistoryStore(p)
  store.load()
  return store
}
