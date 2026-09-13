import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { scanFolder, normalizePhone } from '../src/main/scanner'

describe('normalizePhone', () => {
  it('strips dots and keeps leading 0', () => {
    expect(normalizePhone('0123.456.789')).toBe('0123456789')
  })
  it('converts 84 prefix to 0', () => {
    expect(normalizePhone('84123456789')).toBe('0123456789')
    expect(normalizePhone('+84 123 456 789')).toBe('0123456789')
    expect(normalizePhone('84 123456789')).toBe('0123456789')
  })
  it('returns null for too short', () => {
    expect(normalizePhone('123')).toBeNull()
    expect(normalizePhone('abc')).toBeNull()
  })
  it('handles plain 0 phone', () => {
    expect(normalizePhone('0123456789')).toBe('0123456789')
  })
})

describe('scanFolder', () => {
  let dir: string
  beforeEach(() => {
    dir = join(tmpdir(), `zalo-scan-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(dir, { recursive: true })
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function touch(name: string) {
    writeFileSync(join(dir, name), 'dummy')
  }

  it('parses valid names', () => {
    touch('1234-0123456789.jpg')
    touch('999-0987654321.png')
    const r = scanFolder(dir, { supportedExtensions: ['jpg', 'jpeg', 'png', 'webp'] })
    expect(r.errors).toHaveLength(0)
    expect(r.items).toHaveLength(2)
  })

  it('groups multiple files per phone', () => {
    touch('1-0123456789.jpg')
    touch('2-0123456789.jpg')
    const r = scanFolder(dir, { supportedExtensions: ['jpg'] })
    expect(r.items).toHaveLength(1)
    expect(r.items[0]!.files).toHaveLength(2)
  })

  it('rejects wrong extension', () => {
    touch('1-0123456789.txt')
    const r = scanFolder(dir, { supportedExtensions: ['jpg', 'png'] })
    expect(r.items).toHaveLength(0)
    expect(r.errors.some((e) => e.file === '1-0123456789.txt')).toBe(true)
  })

  it('handles multi-dash id', () => {
    touch('a-b-123-0123456789.jpg')
    const r = scanFolder(dir, { supportedExtensions: ['jpg'] })
    expect(r.items).toHaveLength(1)
    expect(r.items[0]!.id).toBe('a-b-123')
  })

  it('rejects sub-8-digit phones', () => {
    touch('1-123.jpg')
    const r = scanFolder(dir, { supportedExtensions: ['jpg'] })
    expect(r.items).toHaveLength(0)
    expect(r.errors.length).toBe(1)
  })

  it('sorts deterministically by id', () => {
    touch('10-0123456789.jpg')
    touch('2-0987654321.jpg')
    const r = scanFolder(dir, { supportedExtensions: ['jpg'] })
    expect(r.items[0]!.id).toBe('2')
    expect(r.items[1]!.id).toBe('10')
  })

  it('supports +84 variant', () => {
    touch('1-84123456789.jpg')
    const r = scanFolder(dir, { supportedExtensions: ['jpg'] })
    expect(r.items[0]!.phone).toBe('0123456789')
  })
})
