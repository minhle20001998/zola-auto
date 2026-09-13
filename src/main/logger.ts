import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

function logPath(): string {
  try {
    return join(app.getPath('userData'), 'logs', 'debug.log')
  } catch (_e) {
    void _e
    return join(process.cwd(), 'logs', 'debug.log')
  }
}

export function debugLog(msg: string, data?: unknown): void {
  const line = `${new Date().toISOString()} ${msg}${data !== undefined ? ` ${JSON.stringify(data).slice(0, 2000)}` : ''}\n`
  try {
    const p = logPath()
    mkdirSync(join(p, '..'), { recursive: true })
    appendFileSync(p, line)
  } catch (_e) {
    void _e
  }
  console.log(`[debug] ${msg}`, data ?? '')
}

export function getLogPath(): string {
  return logPath()
}
