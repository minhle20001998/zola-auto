import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { defaultConfig, validateConfig, loadConfig, saveConfig } from '../src/main/config'

describe('config', () => {
  it('defaults valid', () => {
    expect(validateConfig(defaultConfig).ok).toBe(true)
  })
  it('invalid ranges', () => {
    expect(validateConfig({ ...defaultConfig, delayMinSec: 60, delayMaxSec: 10 }).ok).toBe(false)
    expect(validateConfig({ ...defaultConfig, dailyCap: -1 }).ok).toBe(false)
  })
  it('invalid types', () => {
    expect(validateConfig({ ...defaultConfig, mode: 'bad' as unknown as string }).ok).toBe(false)
  })

  describe('load/save', () => {
    let dir: string
    beforeEach(() => {
      dir = join(tmpdir(), `zalo-cfg-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      mkdirSync(dir, { recursive: true })
    })
    afterEach(() => rmSync(dir, { recursive: true, force: true }))

    it('returns defaults when absent', () => {
      expect(loadConfig(dir)).toEqual(defaultConfig)
    })
    it('round-trips', () => {
      const cfg = { ...defaultConfig, folderPath: 'C:/tmp', dailyCap: 10 }
      saveConfig(dir, cfg)
      expect(loadConfig(dir)).toEqual(cfg)
    })
    it('throws on invalid save', () => {
      expect(() => saveConfig(dir, { ...defaultConfig, dailyCap: -5 })).toThrow()
    })
  })
})
