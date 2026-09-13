import { readdirSync, statSync } from 'fs'
import { join, basename, extname } from 'path'
import type { WorkItem } from '../shared/types'
import { hashFile, computeKey } from './store'

export interface ScanError {
  file: string
  reason: string
}

export interface ScanResult {
  items: WorkItem[]
  errors: ScanError[]
}

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 8) return null
  if (digits.startsWith('84') && digits.length >= 11 && digits.length <= 12) {
    return `0${digits.slice(2)}`
  }
  return digits
}

function parseFilename(filename: string): { id: string; rawPhone: string; ext: string } | null {
  const base = basename(filename)
  const ext = extname(base).slice(1).toLowerCase()
  const withoutExt = base.slice(0, base.length - ext.length - 1)
  const dashIdx = withoutExt.lastIndexOf('-')
  if (dashIdx === -1) return null
  const id = withoutExt.slice(0, dashIdx)
  const phonePart = withoutExt.slice(dashIdx + 1)
  if (!id || !phonePart) return null
  if (!/^[0-9][0-9.\s]*$/.test(phonePart)) return null
  return { id, rawPhone: phonePart, ext }
}

function compareIds(a: string, b: string): number {
  const an = Number(a)
  const bn = Number(b)
  const aIsNum = !Number.isNaN(an) && String(an) === a
  const bIsNum = !Number.isNaN(bn) && String(bn) === b
  if (aIsNum && bIsNum) return an - bn
  if (aIsNum && !bIsNum) return -1
  if (!aIsNum && bIsNum) return 1
  return a.localeCompare(b)
}

export function scanFolder(
  folderPath: string,
  opts: { supportedExtensions: string[] }
): ScanResult {
  const allowed = new Set(opts.supportedExtensions.map((e) => e.toLowerCase()))
  const items: WorkItem[] = []
  const errors: ScanError[] = []

  let entries: string[]
  try {
    entries = readdirSync(folderPath)
  } catch (e) {
    return { items: [], errors: [{ file: folderPath, reason: String(e) }] }
  }

  const groups = new Map<string, { id: string; rawPhone: string; files: string[]; filenames: string[] }>()

  for (const entry of entries) {
    const full = join(folderPath, entry)
    let st: ReturnType<typeof statSync>
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (!st.isFile()) continue

    const parsed = parseFilename(entry)
    if (!parsed) {
      errors.push({ file: entry, reason: 'filename does not match {id}-{phone}.{ext}' })
      continue
    }

    if (!allowed.has(parsed.ext)) {
      errors.push({ file: entry, reason: `unsupported extension .${parsed.ext}` })
      continue
    }

    const normalized = normalizePhone(parsed.rawPhone)
    if (!normalized) {
      errors.push({ file: entry, reason: `invalid phone "${parsed.rawPhone}"` })
      continue
    }

    const existing = groups.get(normalized)
    if (existing) {
      existing.files.push(full)
      existing.filenames.push(entry)
      if (compareIds(parsed.id, existing.id) < 0) {
        existing.id = parsed.id
      }
    } else {
      groups.set(normalized, {
        id: parsed.id,
        rawPhone: parsed.rawPhone,
        files: [full],
        filenames: [entry]
      })
    }
  }

  for (const [phone, g] of groups) {
    const sortedFiles = g.files
      .map((f, i) => ({ path: f, name: g.filenames[i]! }))
      .sort((a, b) => {
        const pa = parseFilename(a.name)
        const pb = parseFilename(b.name)
        const ca = pa ? compareIds(pa.id, pb!.id) : 0
        if (ca !== 0) return ca
        return a.name.localeCompare(b.name)
      })
      .map((x) => x.path)

    const firstFilename = basename(sortedFiles[0]!)
    items.push({
      id: g.id,
      phone,
      rawPhone: g.rawPhone,
      files: sortedFiles,
      key: `${firstFilename}::pending`
    })
  }

  items.sort((a, b) => compareIds(a.id, b.id) || a.phone.localeCompare(b.phone))

  return { items, errors }
}

export async function enrichWorkItemsWithKeys(items: WorkItem[]): Promise<WorkItem[]> {
  const out: WorkItem[] = []
  for (const it of items) {
    const firstFile = it.files[0]!
    const filename = basename(firstFile)
    const hash = await hashFile(firstFile)
    out.push({ ...it, key: computeKey(filename, hash) })
  }
  return out
}
