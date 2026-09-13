import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'
import type { AppConfig } from '../shared/types'

export const defaultConfig: AppConfig = {
  folderPath: '',
  captionTemplate: '',
  delayMinSec: 20,
  delayMaxSec: 60,
  dailyCap: 50,
  mode: 'debug',
  supportedExtensions: ['jpg', 'jpeg', 'png', 'webp'],
  loginTimeoutSec: 300
}

export const configSchema = z
  .object({
    folderPath: z.string(),
    captionTemplate: z.string(),
    delayMinSec: z.number().min(0),
    delayMaxSec: z.number().min(0),
    dailyCap: z.number().int().min(0),
    mode: z.enum(['debug', 'confirm', 'auto']),
    supportedExtensions: z.array(z.string()).min(1),
    loginTimeoutSec: z.number().int().min(10)
  })
  .refine((c) => c.delayMinSec <= c.delayMaxSec, {
    message: 'delayMinSec must be <= delayMaxSec',
    path: ['delayMinSec']
  })

export type ConfigResult =
  | { ok: true; config: AppConfig }
  | { ok: false; error: string }

function normalizeMode(input: unknown): unknown {
  if (input && typeof input === 'object' && 'mode' in input) {
    const m = (input as Record<string, unknown>).mode
    if (m === 'dryRun') (input as Record<string, unknown>).mode = 'debug'
  }
  return input
}

export function validateConfig(input: unknown): ConfigResult {
  const normalized = normalizeMode(input)
  const parsed = configSchema.safeParse(normalized)
  if (parsed.success) return { ok: true, config: parsed.data }
  return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
}

function configPath(userDataDir: string): string {
  return join(userDataDir, 'config.json')
}

export function loadConfig(userDataDir: string): AppConfig {
  const p = configPath(userDataDir)
  if (!existsSync(p)) return { ...defaultConfig }
  try {
    const raw = readFileSync(p, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    const merged = { ...defaultConfig, ...(parsed as Record<string, unknown>) } as Record<string, unknown>
    if (merged.mode === 'dryRun') merged.mode = 'debug'
    const result = validateConfig(merged)
    if (result.ok) return result.config
    return { ...defaultConfig }
  } catch {
    return { ...defaultConfig }
  }
}

export function saveConfig(userDataDir: string, cfg: AppConfig): void {
  const result = validateConfig(cfg)
  if (!result.ok) throw new Error(result.error)
  mkdirSync(userDataDir, { recursive: true })
  const p = configPath(userDataDir)
  const tmp = `${p}.tmp`
  writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf-8')
  try {
    renameSync(tmp, p)
  } catch {
    writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf-8')
  }
}
