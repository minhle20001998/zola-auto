import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'

const api = {
  ping: (): Promise<string> => ipcRenderer.invoke(IPC.ping),
  configLoad: (): Promise<unknown> => ipcRenderer.invoke(IPC.configLoad),
  configSave: (cfg: unknown): Promise<unknown> => ipcRenderer.invoke(IPC.configSave, cfg),
  scanFolder: (folderPath: string): Promise<unknown> =>
    ipcRenderer.invoke(IPC.scanFolder, folderPath),
  zaloOpen: (): Promise<unknown> => ipcRenderer.invoke(IPC.zaloOpen),
  zaloLoginStatus: (): Promise<{ loggedIn: boolean }> =>
    ipcRenderer.invoke(IPC.zaloLoginStatus),
  zaloWaitLogin: (timeoutSec?: number): Promise<unknown> =>
    ipcRenderer.invoke(IPC.zaloWaitLogin, timeoutSec),
  zaloLogin: (): Promise<unknown> => ipcRenderer.invoke(IPC.zaloLogin),
  zaloLogout: (): Promise<unknown> => ipcRenderer.invoke(IPC.zaloLogout),
  zaloSearch: (phone: string): Promise<unknown> => ipcRenderer.invoke(IPC.zaloSearch, phone),
  debugDump: (): Promise<unknown> => ipcRenderer.invoke(IPC.debugDump),
  debugGetLog: (): Promise<{ log: string; path: string }> => ipcRenderer.invoke(IPC.debugGetLog),
  debugGetLogPath: (): Promise<{ path: string }> => ipcRenderer.invoke(IPC.debugGetLogPath),
  debugClearLog: (): Promise<unknown> => ipcRenderer.invoke(IPC.debugClearLog),
  readImage: (filePath: string): Promise<{ ok: boolean; data?: string; mime?: string; name?: string; error?: string }> => ipcRenderer.invoke(IPC.readImage, filePath),
  pickFolder: (): Promise<{ canceled: boolean; path?: string }> => ipcRenderer.invoke(IPC.pickFolder),
  selectorsGet: (): Promise<{ selectors: unknown; path: string | null }> => ipcRenderer.invoke(IPC.selectorsGet),
  selectorsGetPath: (): Promise<{ path: string | null }> => ipcRenderer.invoke(IPC.selectorsGetPath),
  selectorsReload: (): Promise<{ selectors: unknown; path: string | null }> => ipcRenderer.invoke(IPC.selectorsReload),
  runStart: (payload: unknown): Promise<unknown> =>
    ipcRenderer.invoke(IPC.runStart, payload),
  runStop: (): Promise<unknown> => ipcRenderer.invoke(IPC.runStop),
  updaterCheck: (): Promise<unknown> => ipcRenderer.invoke(IPC.updaterCheck),
  updaterQuitAndInstall: (): Promise<void> =>
    ipcRenderer.invoke(IPC.updaterQuitAndInstall),
  on: (channel: string, cb: (...args: unknown[]) => void) => {
    const allowed = [
      IPC.runProgress,
      IPC.runLog,
      IPC.runDone,
      IPC.zaloPickCandidate,
      IPC.zaloConfirmSend,
      IPC.updaterEvent
    ] as string[]
    if (!allowed.includes(channel)) return () => {}
    const handler = (_: unknown, ...args: unknown[]) => cb(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
  sendPickCandidateResponse: (choice: number | 'skip'): void =>
    ipcRenderer.send(IPC.zaloPickCandidateResponse, choice),
  sendConfirmSendResponse: (action: 'send' | 'skip', caption?: string): void =>
    ipcRenderer.send(IPC.zaloConfirmSendResponse, { action, caption })
}

contextBridge.exposeInMainWorld('api', api)

declare global {
  interface Window {
    api: typeof api
  }
}
