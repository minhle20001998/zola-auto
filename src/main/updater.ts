/* eslint-disable @typescript-eslint/no-explicit-any */
import { app, BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc'
import { debugLog } from './logger'

export function setupUpdater(): void {
  const send = (payload: unknown) => {
    debugLog('[updater] event', JSON.stringify(payload).slice(0, 2000))
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send(IPC.updaterEvent, payload)
    // also mirror to run:log so Logs card always shows it
    win?.webContents.send(IPC.runLog, {
      level: (payload as { type: string }).type === 'error' ? 'error' : 'info',
      at: new Date().toISOString(),
      message: `[updater] ${JSON.stringify(payload).slice(0, 1500)}`
    })
  }

  if (!app.isPackaged) {
    debugLog('[updater] not packaged — skip auto check')
    console.log('[updater] not packaged — skip auto check')
    return
  }

  import('electron-updater')
    .then((mod: unknown) => {
      const autoUpdater = (mod as { autoUpdater?: unknown }).autoUpdater
        ?? (mod as { default?: { autoUpdater?: unknown } }).default?.autoUpdater
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ?? (mod as { default?: unknown }).default as unknown as any
      if (!autoUpdater || typeof (autoUpdater as { checkForUpdates?: unknown }).checkForUpdates !== 'function') {
        throw new Error(`autoUpdater not found: keys=${Object.keys(mod as object).join(',')}`)
      }
      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = false
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      autoUpdater.logger = null as unknown as any // we use debugLog instead

      debugLog('[updater] setupUpdater — listeners attached, calling checkForUpdates()', `version=${app.getVersion()} resourcesPath=${process.resourcesPath}`)
      autoUpdater.on('checking-for-update', () => send({ type: 'checking-for-update' }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      autoUpdater.on('update-available', (info: any) => send({ type: 'update-available', info }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      autoUpdater.on('update-not-available', (info: any) => send({ type: 'update-not-available', info }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      autoUpdater.on('download-progress', (p: any) => send({ type: 'download-progress', progress: p }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      autoUpdater.on('update-downloaded', (info: any) => send({ type: 'update-downloaded', info }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      autoUpdater.on('error', (err: any) => {
        const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
        debugLog('[updater] error event', msg)
        send({ type: 'error', message: msg })
      })

      // startup auto-check — never let it hang silently
      let settled = false
      const t = setTimeout(() => {
        if (!settled) {
          const msg = 'Startup check timed out after 30s — no response from GitHub (network blocked, app-update.yml missing, or GitHub rate-limit). See debug.log'
          debugLog('[updater] startup timeout', msg)
          send({ type: 'error', message: msg })
        }
      }, 30_000)
      void autoUpdater
        .checkForUpdates()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then((r: any) => {
          settled = true
          clearTimeout(t)
          debugLog('[updater] checkForUpdates resolved', JSON.stringify(r).slice(0, 2000))
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .catch((e: any) => {
          settled = true
          clearTimeout(t)
          const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)
          debugLog('[updater] checkForUpdates rejected', msg)
          send({ type: 'error', message: msg })
        })
    })
    .catch((e) => {
      const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)
      debugLog('[updater] import failed', msg)
      send({ type: 'error', message: msg })
    })
}
