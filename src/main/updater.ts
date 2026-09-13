import { app, BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc'

export function setupUpdater(): void {
  if (!app.isPackaged) return

  import('electron-updater')
    .then(({ autoUpdater }) => {
      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = false

      const send = (payload: unknown) => {
        const win = BrowserWindow.getAllWindows()[0]
        win?.webContents.send(IPC.updaterEvent, payload)
      }

      autoUpdater.on('checking-for-update', () => send({ type: 'checking-for-update' }))
      autoUpdater.on('update-available', (info) => send({ type: 'update-available', info }))
      autoUpdater.on('update-not-available', (info) => send({ type: 'update-not-available', info }))
      autoUpdater.on('download-progress', (p) => send({ type: 'download-progress', progress: p }))
      autoUpdater.on('update-downloaded', (info) => send({ type: 'update-downloaded', info }))
      autoUpdater.on('error', (err) => send({ type: 'error', message: String(err) }))

      void autoUpdater.checkForUpdates().catch((e) => {
        send({ type: 'error', message: String(e) })
      })
    })
    .catch(() => {})
}
