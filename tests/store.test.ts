import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { computeKey, HistoryStore, hashFile, openStore } from '../src/main/store'

describe('store', () => {
  it('computeKey', () => {
    expect(computeKey('a.jpg', 'abc')).toBe('a.jpg::abc')
  })

  it('hashFile', async () => {
    const dir = join(tmpdir(), `zalo-hash-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    const p = join(dir, 'f.txt')
    writeFileSync(p, 'hello')
    const h = await hashFile(p)
    expect(h).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
    rmSync(dir, { recursive: true, force: true })
  })

  describe('HistoryStore', () => {
    let dir: string
    let file: string
    beforeEach(() => {
      dir = join(tmpdir(), `zalo-store-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      mkdirSync(dir, { recursive: true })
      file = join(dir, 'history.json')
    })
    afterEach(() => rmSync(dir, { recursive: true, force: true }))

    it('hasSent after add', () => {
      const s = new HistoryStore(file)
      s.load()
      const key = computeKey('a.jpg', 'h1')
      expect(s.hasSent(key)).toBe(false)
      s.add({ key, filename: 'a.jpg', hash: 'h1', phone: '096', id: '1', status: 'sent', at: new Date().toISOString() })
      expect(s.hasSent(key)).toBe(true)
      expect(s.all()).toHaveLength(1)
    })

    it('persists and reloads', () => {
      const s = new HistoryStore(file)
      s.load()
      const key = computeKey('b.jpg', 'h2')
      s.add({ key, filename: 'b.jpg', hash: 'h2', phone: '097', id: '2', status: 'sent', at: new Date().toISOString() })
      const s2 = new HistoryStore(file)
      s2.load()
      expect(s2.hasSent(key)).toBe(true)
    })

    it('corrupt file recovers empty', () => {
      writeFileSync(file, 'not json')
      const s = new HistoryStore(file)
      s.load()
      expect(s.all()).toHaveLength(0)
    })

    it('openStore helper', () => {
      const s = openStore(dir)
      expect(s.all()).toHaveLength(0)
    })
  })
})
