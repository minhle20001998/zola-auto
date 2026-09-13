import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import type { BrowserContext, Page } from 'playwright'

let context: BrowserContext | null = null
let cachedUserDataDir: string | null = null

if (!app.isPackaged) process.env.PLAYWRIGHT_BROWSERS_PATH = '0'

function resolveBrowsersPath(): string | undefined {
  if (app.isPackaged) {
    const unpacked = join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'playwright-core', '.local-browsers')
    if (existsSync(unpacked)) return unpacked
    const alt = join(process.resourcesPath, 'node_modules', 'playwright-core', '.local-browsers')
    if (existsSync(alt)) return alt
    return undefined
  }
  return '0'
}

export async function launchBrowser(userDataDir: string): Promise<BrowserContext> {
  if (context && cachedUserDataDir === userDataDir) return context

  const browsersPath = resolveBrowsersPath()
  if (browsersPath) process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath

  const { chromium } = await import('playwright')

  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled']
    })
  } catch (e) {
    const msg = String(e)
    if (msg.includes('already in use') || msg.includes('SingletonLock')) {
      throw new Error(`Browser profile locked — close other instances. ${msg}`)
    }
    throw e
  }

  cachedUserDataDir = userDataDir
  context.on('close', () => {
    context = null
    cachedUserDataDir = null
  })

  return context
}

export async function getPage(userDataDir: string): Promise<Page> {
  const ctx = await launchBrowser(userDataDir)
  let page = ctx.pages()[0]
  if (!page) page = await ctx.newPage()
  const url = page.url()
  if (!url || url === 'about:blank' || !url.includes('chat.zalo.me')) {
    await page.goto('https://chat.zalo.me', { waitUntil: 'domcontentloaded' })
  }
  return page
}

export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close()
    context = null
    cachedUserDataDir = null
  }
}

export function getContext(): BrowserContext | null {
  return context
}
