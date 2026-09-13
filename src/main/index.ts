/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment */
import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { IPC } from '../shared/ipc'
import { debugLog, getLogPath } from './logger'
import { loadConfig, saveConfig } from './config'
import { scanFolder, enrichWorkItemsWithKeys } from './scanner'
import { getPage, closeBrowser, getContext } from './zalo/browser'
import { isLoggedIn, waitForLogin, performLogout, getCachedLoginStatus, setCachedLoginStatus } from './zalo/login'
import { searchPhone, resolveCandidate, openChat, clearSearch } from './zalo/search'
import { setupUpdater } from './updater'

let mainWindow: BrowserWindow | null = null
let pendingPickResolve: ((v: number | 'skip') => void) | null = null
let pendingConfirmResolve: ((v: { action: 'send' | 'skip'; caption?: string }) => void) | null = null

function getUserDataDir(): string {
  return app.getPath('userData')
}

function createWindow(): void {
  const iconPath = app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(__dirname, '../../resources/icon.png')
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    icon: existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.ELECTRON_START_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_START_URL)
  } else if (!app.isPackaged) {
    void mainWindow.loadURL('http://localhost:5173')
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()
  setupUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void closeBrowser()
})

ipcMain.on(IPC.zaloPickCandidateResponse, (_e, choice: number | 'skip') => {
  if (pendingPickResolve) {
    pendingPickResolve(choice)
    pendingPickResolve = null
  }
})

ipcMain.on(IPC.zaloConfirmSendResponse, (_e, data: { action: 'send' | 'skip'; caption?: string } | 'send' | 'skip') => {
  if (pendingConfirmResolve) {
    if (typeof data === 'string') {
      pendingConfirmResolve({ action: data })
    } else {
      pendingConfirmResolve(data)
    }
    pendingConfirmResolve = null
  }
})

export function waitForPick(candidates: unknown): Promise<number | 'skip'> {
  return new Promise((resolve) => {
    pendingPickResolve = resolve
    mainWindow?.webContents.send(IPC.zaloPickCandidate, candidates)
  })
}

export function waitForConfirm(payload: unknown): Promise<{ action: 'send' | 'skip'; caption?: string }> {
  return new Promise((resolve) => {
    pendingConfirmResolve = resolve
    mainWindow?.webContents.send(IPC.zaloConfirmSend, payload)
  })
}

ipcMain.handle(IPC.ping, async () => 'pong from main')
ipcMain.handle(IPC.getVersion, async () => app.getVersion())

ipcMain.handle(IPC.configLoad, async () => {
  const cfg = loadConfig(getUserDataDir())
  return cfg
})

ipcMain.handle(IPC.configSave, async (_e, cfg: unknown) => {
  const { validateConfig } = await import('./config')
  const result = validateConfig(cfg)
  if (!result.ok) throw new Error(result.error)
  saveConfig(getUserDataDir(), result.config)
  return result.config
})

ipcMain.handle(IPC.scanFolder, async (_e, folderPath: string) => {
  const cfg = loadConfig(getUserDataDir())
  const res = scanFolder(folderPath, { supportedExtensions: cfg.supportedExtensions })
  const items = await enrichWorkItemsWithKeys(res.items)
  return { items, errors: res.errors }
})

ipcMain.handle(IPC.zaloOpen, async () => {
  const zaloProfile = join(getUserDataDir(), 'zalo-profile')
  const page = await getPage(zaloProfile)
  return { url: page.url() }
})

ipcMain.handle(IPC.zaloLoginStatus, async () => {
  debugLog('[zaloLoginStatus] called')
  try {
    const ctx = getContext()
    debugLog('[zaloLoginStatus] getContext exists', !!ctx)
    if (ctx) {
      const zaloProfile = join(getUserDataDir(), 'zalo-profile')
      const page = await getPage(zaloProfile)
      const loggedIn = await isLoggedIn(page)
      debugLog('[zaloLoginStatus] via visible ctx', loggedIn)
      setCachedLoginStatus(getUserDataDir(), loggedIn)
      return { loggedIn }
    }
    // No visible browser – do a headless check so no window annoys the user
    // Small delay to let SingletonLock release after a recent closeBrowser
    await new Promise((r) => setTimeout(r, 800))
    try {
      const zaloProfile = join(getUserDataDir(), 'zalo-profile')
      const { chromium } = await import('playwright')
      const browsersPath = (() => {
        if (app.isPackaged) {
          const unpacked = join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'playwright-core', '.local-browsers')
          if (existsSync(unpacked)) return unpacked
          const alt = join(process.resourcesPath, 'node_modules', 'playwright-core', '.local-browsers')
          if (existsSync(alt)) return alt
          return undefined
        }
        return '0'
      })()
      if (browsersPath) process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath
      debugLog('[zaloLoginStatus] launching headless check')
      const tempCtx = await chromium.launchPersistentContext(zaloProfile, {
        headless: true,
        viewport: { width: 1280, height: 800 },
        args: ['--disable-blink-features=AutomationControlled']
      })
      const page = tempCtx.pages()[0] ?? (await tempCtx.newPage())
      if (!page.url() || !page.url().includes('chat.zalo.me')) {
        await page.goto('https://chat.zalo.me', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {})
      }
      await page.waitForTimeout(1500)
      const loggedIn = await isLoggedIn(page)
      debugLog('[zaloLoginStatus] headless result', loggedIn)
      await tempCtx.close().catch(() => {})
      const cachedBefore = getCachedLoginStatus(getUserDataDir())
      debugLog('[zaloLoginStatus] cachedBefore', cachedBefore)
      // Don't overwrite a true cache with a false headless result that may be transient
      if (loggedIn === false && cachedBefore === true) {
        debugLog('[zaloLoginStatus] keeping cached true despite headless false')
        return { loggedIn: true }
      }
      setCachedLoginStatus(getUserDataDir(), loggedIn)
      return { loggedIn }
    } catch (e) {
      debugLog('[zaloLoginStatus] headless error', String(e))
      const cached = getCachedLoginStatus(getUserDataDir())
      debugLog('[zaloLoginStatus] fallback cached', cached)
      if (cached !== null) return { loggedIn: cached }
      return { loggedIn: false }
    }
  } catch (e) {
    debugLog('[zaloLoginStatus] outer error', String(e))
    return { loggedIn: false }
  }
})

ipcMain.handle(IPC.zaloWaitLogin, async (e, timeoutSec: number | undefined) => {
  const cfg = loadConfig(getUserDataDir())
  const timeout = timeoutSec ?? cfg.loginTimeoutSec
  const zaloProfile = join(getUserDataDir(), 'zalo-profile')
  const page = await getPage(zaloProfile)
  await waitForLogin(page, timeout, (elapsed) => {
    e.sender.send(IPC.runLog, { level: 'info', at: new Date().toISOString(), message: `Waiting for login: ${elapsed}s` })
  })
  return { ok: true }
})

ipcMain.handle(IPC.zaloLogin, async (e) => {
  const zaloProfile = join(getUserDataDir(), 'zalo-profile')
  const page = await getPage(zaloProfile)
  try {
    const cfg = loadConfig(getUserDataDir())
    await waitForLogin(page, cfg.loginTimeoutSec, (elapsed) => {
      e.sender.send(IPC.runLog, { level: 'info', at: new Date().toISOString(), message: `Waiting for login: ${elapsed}s` })
    })
    setCachedLoginStatus(getUserDataDir(), true)
    e.sender.send(IPC.runLog, { level: 'info', at: new Date().toISOString(), message: 'Logged in' })
    return { ok: true }
  } finally {
    await closeBrowser().catch(() => {})
  }
})

ipcMain.handle(IPC.zaloLogout, async (e) => {
  const zaloProfile = join(getUserDataDir(), 'zalo-profile')
  const page = await getPage(zaloProfile)
  await performLogout(page, (m) => e.sender.send(IPC.runLog, { level: 'info', at: new Date().toISOString(), message: m }))
  setCachedLoginStatus(getUserDataDir(), false)
  e.sender.send(IPC.runLog, { level: 'info', at: new Date().toISOString(), message: 'Logged out — browser left open so you can verify the QR page' })
  return { ok: true }
  // intentionally not closing browser so you can see the logout result
})

ipcMain.handle(IPC.zaloSearch, async (e, phone: string) => {
  const zaloProfile = join(getUserDataDir(), 'zalo-profile')
  const page = await getPage(zaloProfile)
  const candidates = await searchPhone(page, phone)
  const resolved = resolveCandidate(candidates)
  if (resolved.kind === 'single') {
    await openChat(page, resolved.candidate)
    return { kind: 'single', candidate: resolved.candidate }
  }
  if (resolved.kind === 'empty') {
    return { kind: 'empty' }
  }
  e.sender.send(IPC.runLog, { level: 'info', at: new Date().toISOString(), message: `Found ${candidates.length} candidates for ${phone} — waiting for pick` })
  const choice = await waitForPick({ phone, candidates })
  if (choice === 'skip') {
    await clearSearch(page)
    return { kind: 'skipped' }
  }
  const picked = candidates.find((c) => c.index === choice)
  if (!picked) {
    await clearSearch(page)
    return { kind: 'skipped' }
  }
  await openChat(page, picked)
  return { kind: 'picked', candidate: picked }
})

let stopRequested = false
let isRunning = false

ipcMain.handle(IPC.runStart, async (e, payload: unknown) => {
  if (isRunning) throw new Error('Run already in progress')
  isRunning = true
  stopRequested = false
  const p = payload as { config?: unknown; items?: unknown; folderPath?: string; forceResend?: boolean }
  let config = loadConfig(getUserDataDir())
  if (p?.config) {
    const { validateConfig } = await import('./config')
    const r = validateConfig(p.config)
    if (r.ok) config = r.config
  }
  let items: import('../shared/types').WorkItem[] = []
  if (p?.items && Array.isArray(p.items)) {
    items = p.items as import('../shared/types').WorkItem[]
  } else {
    const folder = p?.folderPath ?? config.folderPath
    if (!folder) throw new Error('No folderPath provided')
    const res = scanFolder(folder, { supportedExtensions: config.supportedExtensions })
    items = await enrichWorkItemsWithKeys(res.items)
    if (res.errors.length > 0) {
      e.sender.send(IPC.runLog, { level: 'warn', at: new Date().toISOString(), message: `Scan warnings: ${JSON.stringify(res.errors)}` })
    }
  }

  const { runEngine } = await import('./zalo/engine')
  try {
    const report = await runEngine({
      config,
      items,
      userDataDir: getUserDataDir(),
      forceResend: p?.forceResend,
      onProgress: (msg) => e.sender.send(IPC.runProgress, msg),
      onLog: (entry) => e.sender.send(IPC.runLog, entry),
      waitForPick: (data) => waitForPick(data),
      waitForConfirm: (data) => waitForConfirm(data),
      shouldStop: () => stopRequested
    })
    e.sender.send(IPC.runDone, report)
    return report
  } finally {
    isRunning = false
  }
})

ipcMain.handle(IPC.runStop, async () => {
  stopRequested = true
  if (pendingPickResolve) {
    pendingPickResolve('skip')
    pendingPickResolve = null
  }
  if (pendingConfirmResolve) {
    pendingConfirmResolve({ action: 'skip' })
    pendingConfirmResolve = null
  }
  return { ok: true }
})

ipcMain.handle(IPC.updaterCheck, async () => {
  debugLog('[updaterCheck] invoked', `isPackaged=${app.isPackaged} version=${app.getVersion()}`)
  if (!app.isPackaged) {
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send(IPC.updaterEvent, { type: 'error', message: 'Not packaged — updates only work in built exe (dist/*.exe)' })
    win?.webContents.send(IPC.runLog, { level: 'info', at: new Date().toISOString(), message: 'Updater: not packaged — skip (only works in built exe)' })
    return { ok: true, note: 'not packaged — skip' }
  }
  const win = BrowserWindow.getAllWindows()[0]
  win?.webContents.send(IPC.updaterEvent, { type: 'checking-for-update' })
  win?.webContents.send(IPC.runLog, { level: 'info', at: new Date().toISOString(), message: `[updater] manual check started — version ${app.getVersion()}` })
  try {
    const mod: unknown = await import('electron-updater')
    const autoUpdater = (mod as { autoUpdater?: unknown }).autoUpdater
      ?? (mod as { default?: { autoUpdater?: unknown } }).default?.autoUpdater
      ?? (mod as { default?: unknown }).default as unknown
    if (!autoUpdater || typeof (autoUpdater as { checkForUpdates?: unknown }).checkForUpdates !== 'function') {
      throw new Error(`autoUpdater not found in electron-updater module: keys=${Object.keys(mod as object).join(',')}`)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const au = autoUpdater as any
    // ensure listeners exist even if setupUpdater was skipped for any reason
    const send = (payload: unknown) => {
      debugLog('[updaterCheck] event', JSON.stringify(payload).slice(0, 2000))
      win?.webContents.send(IPC.updaterEvent, payload)
      win?.webContents.send(IPC.runLog, { level: (payload as { type: string }).type === 'error' ? 'error' : 'info', at: new Date().toISOString(), message: `[updater] ${JSON.stringify(payload).slice(0, 1500)}` })
    }
    // attach one-shot timeout so UI never hangs on "Checking..."
    let settled = false
    const t = setTimeout(() => {
      if (!settled) {
        const msg = 'Check timed out after 30s — no response. Likely: app-update.yml missing, network blocked, or GitHub 404/rate-limit. Open debug.log for details.'
        debugLog('[updaterCheck] timeout', msg)
        send({ type: 'error', message: msg })
      }
    }, 30_000)
    // make sure error listener exists — use on/once safely
    const once = (ev: string, fn: (...args: unknown[]) => void) => {
      const target = au as unknown as { once?: unknown; on?: unknown }
      if (typeof target.once === 'function') (target.once as (e: string, f: (...a: unknown[])=>void)=>void)(ev, fn)
      else if (typeof target.on === 'function') (target.on as (e: string, f: (...a: unknown[])=>void)=>void)(ev, fn)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    once('error', (err: any) => {
      settled = true
      clearTimeout(t)
      const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
      debugLog('[updaterCheck] error event', msg)
      send({ type: 'error', message: msg })
    })
    once('update-available', () => { settled = true; clearTimeout(t) })
    once('update-not-available', () => { settled = true; clearTimeout(t) })
    once('update-downloaded', () => { settled = true; clearTimeout(t) })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await au.checkForUpdates().then((r: any) => {
      debugLog('[updaterCheck] checkForUpdates resolved', JSON.stringify(r).slice(0, 2000))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }).catch((e: any) => {
      settled = true
      clearTimeout(t)
      const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)
      debugLog('[updaterCheck] checkForUpdates rejected', msg)
      send({ type: 'error', message: msg })
    })
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)
    debugLog('[updaterCheck] fatal', msg)
    win?.webContents.send(IPC.updaterEvent, { type: 'error', message: msg })
    win?.webContents.send(IPC.runLog, { level: 'error', at: new Date().toISOString(), message: `[updater] fatal: ${msg}` })
  }
  return { ok: true }
})
ipcMain.handle(IPC.updaterQuitAndInstall, async () => {
  const mod: unknown = await import('electron-updater')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autoUpdater = (mod as { autoUpdater?: unknown }).autoUpdater
    ?? (mod as { default?: { autoUpdater?: unknown } }).default?.autoUpdater
    ?? (mod as { default?: unknown }).default as unknown as any
  autoUpdater.quitAndInstall()
})

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
ipcMain.handle(IPC.debugDump, async () => {
  const zaloProfile = join(getUserDataDir(), 'zalo-profile')
  const page = await getPage(zaloProfile)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  const dump = await page.evaluate(() => {
    // @ts-expect-error browser globals
    const allInputs = [...document.querySelectorAll('input[type="file"]')].map((el: any) => ({
      // @ts-expect-error
      outer: (el as HTMLElement).outerHTML.slice(0, 800),
      // @ts-expect-error
      id: (el as HTMLElement).id,
      // @ts-expect-error
      cls: (el as HTMLElement).className,
      // @ts-expect-error
      accept: (el as HTMLInputElement).accept
    }))
    // @ts-expect-error
    const composerCandidates = [...document.querySelectorAll('[contenteditable], [role="textbox"], #richInput, div[contenteditable="true"]')].slice(0, 5).map((el: any) => ({
      tag: el.tagName,
      // @ts-expect-error
      id: (el as HTMLElement).id,
      // @ts-expect-error
      cls: (el as HTMLElement).className?.slice(0, 120),
      role: el.getAttribute('role'),
      // @ts-expect-error
      outer: (el as HTMLElement).outerHTML.slice(0, 1000)
    }))
    // @ts-expect-error
    const attachBtns = [...document.querySelectorAll('button, [role="button"], i.fa')].filter((el: any) => {
      // @ts-expect-error
      const t = (el.textContent || '') + (el as HTMLElement).className + (el.getAttribute('aria-label') || '') + (el.getAttribute('title') || '')
      return /attach|file|image|picture|photo|clip|paperclip/i.test(t)
    }).slice(0, 10).map((el: any) => ({
      tag: el.tagName,
      // @ts-expect-error
      cls: (el as HTMLElement).className?.slice(0, 100),
      aria: el.getAttribute('aria-label'),
      title: el.getAttribute('title'),
      // @ts-expect-error
      outer: (el as HTMLElement).outerHTML.slice(0, 700)
    }))
    // @ts-expect-error
    const dataIds = [...document.querySelectorAll('[data-id]')].slice(0, 40).map((el: any) => ({
      did: el.getAttribute('data-id'),
      // @ts-expect-error
      cls: (el as HTMLElement).className?.slice(0, 80),
      // @ts-expect-error
      outer: (el as HTMLElement).outerHTML.slice(0, 600)
    }))
    // @ts-expect-error
    const header = document.querySelector('.conv-item-title__name, [class*="header"]')?.outerHTML.slice(0, 800) ?? ''
    // @ts-expect-error
    return { allInputs, composerCandidates, attachBtns, dataIds, header, url: location.href }
  })
  return dump
})

ipcMain.handle(IPC.debugGetLog, async () => {
  try {
    const p = getLogPath()
    const { readFileSync, existsSync } = await import('fs')
    if (!existsSync(p)) return { log: '', path: p }
    const log = readFileSync(p, 'utf-8').slice(-20000)
    return { log, path: p }
  } catch (e) {
    return { log: String(e), path: getLogPath() }
  }
})

ipcMain.handle(IPC.debugGetLogPath, async () => ({ path: getLogPath() }))

ipcMain.handle(IPC.debugClearLog, async () => {
  try {
    const { writeFileSync, mkdirSync } = await import('fs')
    const { join } = await import('path')
    const p = getLogPath()
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, '')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
})

ipcMain.handle(IPC.readImage, async (_e, filePath: string) => {
  try {
    const { readFileSync, existsSync } = await import('fs')
    if (!existsSync(filePath)) return { ok: false, error: 'not found' }
    const data = readFileSync(filePath)
    const ext = filePath.split('.').pop()?.toLowerCase() ?? 'jpg'
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg'
    return { ok: true, data: data.toString('base64'), mime, name: filePath.split(/[\\/]/).pop() }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
})

ipcMain.handle(IPC.pickFolder, async () => {
  const { dialog } = await import('electron')
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow
  if (!win) return { canceled: true }
  const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
  if (res.canceled || res.filePaths.length === 0) return { canceled: true }
  return { canceled: false, path: res.filePaths[0] }
})

ipcMain.handle(IPC.selectorsGet, async () => {
  const { SEL, getSelectorsPath } = await import('./zalo/selectors')
  return { selectors: SEL, path: getSelectorsPath() }
})

ipcMain.handle(IPC.selectorsGetPath, async () => {
  const { getSelectorsPath } = await import('./zalo/selectors')
  return { path: getSelectorsPath() }
})

ipcMain.handle(IPC.selectorsReload, async () => {
  const { reloadSelectors, getSelectorsPath } = await import('./zalo/selectors')
  const selectors = reloadSelectors()
  return { selectors, path: getSelectorsPath() }
})
