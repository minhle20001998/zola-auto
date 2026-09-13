/* eslint-disable @typescript-eslint/no-explicit-any */
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import type { Page } from 'playwright'
import { SEL } from './selectors'
import { debugLog } from '../logger'

declare const document: any

export class LoginTimeoutError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'LoginTimeoutError'
  }
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  const url = page.url()
  debugLog('[isLoggedIn] url', url)
  if (url.includes('id.zalo.me') || url.includes(SEL.login.loginUrlHint)) {
    debugLog('[isLoggedIn] false due to login url')
    return false
  }
  try {
    const el = page.locator(SEL.app.searchInput).first()
    const count = await el.count()
    debugLog('[isLoggedIn] searchInput count', count)
    if (count > 0) {
      try {
        const vis = await el.isVisible({ timeout: 1500 })
        debugLog('[isLoggedIn] searchInput visible', vis)
        if (vis) return true
      } catch (_e) {
        void _e
      }
      debugLog('[isLoggedIn] true via count>0')
      return true
    }
  } catch (_e) {
    debugLog('[isLoggedIn] searchInput error', String(_e))
    void _e
  }
  try {
    const root = page.locator(SEL.app.loggedInRoot).first()
    const c = await root.count()
    debugLog('[isLoggedIn] loggedInRoot count', c)
    if (c > 0) return true
    const vis = await root.isVisible({ timeout: 1500 }).catch(() => false)
    debugLog('[isLoggedIn] loggedInRoot visible', vis)
    if (vis) return true
  } catch (_e) {
    debugLog('[isLoggedIn] root error', String(_e))
    void _e
  }
  debugLog('[isLoggedIn] false final')
  return false
}

export async function waitForLogin(
  page: Page,
  timeoutSec: number,
  onProgress?: (elapsedSec: number) => void
): Promise<void> {
  const start = Date.now()
  const deadline = start + timeoutSec * 1000
  while (Date.now() < deadline) {
    if (await isLoggedIn(page)) return
    const elapsed = Math.floor((Date.now() - start) / 1000)
    onProgress?.(elapsed)
    await page.waitForTimeout(2000)
  }
  if (await isLoggedIn(page)) return
  try {
    await page.screenshot({ path: `reports/login-timeout-${Date.now()}.png` })
  } catch (_e) {
    void _e
  }
  throw new LoginTimeoutError(`Login timeout after ${timeoutSec}s — QR not scanned`)
}

export async function performLogout(page: Page, onLog?: (msg: string) => void): Promise<void> {
  const log = (m: string) => {
    console.log(`[logout] ${m}`)
    onLog?.(m)
  }
  // Ensure page is ready before checking login state
  await page.waitForTimeout(1200)
  const beforeLogged = await isLoggedIn(page)
  const beforeUrl = page.url()
  log(`isLoggedIn before: ${beforeLogged} url=${beforeUrl}`)
  if (!beforeLogged) {
    await page.waitForTimeout(1500)
    const retry = await isLoggedIn(page)
    log(`retry isLoggedIn: ${retry} url=${page.url()}`)
    if (!retry) {
      log('already not logged in (after retry), skipping logout clicks')
      return
    }
  }
  log('clicking settings cog')
  const settings = page.locator(SEL.settings.cogButton).first()
  try {
    await settings.waitFor({ state: 'visible', timeout: 5000 })
  } catch (_e) {
    void _e
  }
  let clicked = false
  try {
    await settings.click({ timeout: 5000 })
    clicked = true
    log('clicked cog via locator')
  } catch (_e) {
    void _e
  }
  if (!clicked) {
    try {
      await page.evaluate(() => {
        const el = document.querySelector('[data-id="div_Main_TabSetting"]') as any
        el?.click()
      })
      clicked = true
      log('clicked cog via evaluate')
    } catch (_e) {
      void _e
    }
  }
  await page.waitForTimeout(1000)
  const logoutItem = page.locator(SEL.settings.logoutItem).first()
  const logoutCount = await logoutItem.count()
  log(`Đăng xuất menu count=${logoutCount}`)
  if (logoutCount === 0) {
    const ids = await page.evaluate(() => [...document.querySelectorAll('[data-id]')].map((el: any) => el.getAttribute('data-id')).slice(0, 30).join(', '))
    log(`available data-ids: ${ids}`)
    try {
      await page.screenshot({ path: `reports/logout-no-item-${Date.now()}.png` })
    } catch (_e) {
      void _e
    }
    throw new Error('Đăng xuất button not found – logged available data-ids')
  }
  try {
    await logoutItem.waitFor({ state: 'visible', timeout: 5000 })
  } catch (_e) {
    void _e
    log('logoutItem not visible after wait, trying force click')
  }
  try {
    await logoutItem.click({ timeout: 5000 })
    log('clicked Đăng xuất menu')
  } catch (_e) {
    void _e
    await page.evaluate(() => {
      const el = document.querySelector('[data-id="div_TabSetting_Logout"]') as any
      el?.click()
    })
    log('clicked Đăng xuất via evaluate')
  }
  await page.waitForTimeout(1000)
  const confirmBtn = page.locator(SEL.settings.logoutConfirm).first()
  const confirmCount = await confirmBtn.count()
  log(`confirm Đăng xuất count=${confirmCount}`)
  if (confirmCount === 0) {
    const htmlLen = await page.content().then((h) => h.length).catch(() => 0)
    log(`no confirm, page length ${htmlLen}`)
    try {
      await page.screenshot({ path: `reports/logout-no-confirm-${Date.now()}.png` })
    } catch (_e) {
      void _e
    }
  }
  try {
    if (confirmCount > 0) {
      const visible = await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)
      log(`confirm visible=${visible}`)
      if (visible) {
        await confirmBtn.click({ timeout: 3000 }).catch(async () => {
          await page.evaluate(() => {
            const el = document.querySelector('[data-id="btn_Logout_Logout"]') as any
            el?.click()
          })
          log('clicked confirm via evaluate')
        })
        await page.waitForTimeout(1500)
        log('clicked confirm Đăng xuất')
      } else {
        await page.evaluate(() => {
          const el = document.querySelector('[data-id="btn_Logout_Logout"]') as any
          el?.click()
        })
        log('clicked confirm via evaluate (not visible)')
        await page.waitForTimeout(1000)
      }
    }
  } catch (_e) {
    void _e
  }
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    if (!(await isLoggedIn(page))) {
      log('logout verified – not logged in')
      return
    }
    await page.waitForTimeout(500)
  }
  log('logout wait timeout – still logged in')
}

export function getCachedLoginStatus(userDataDir: string): boolean | null {
  const p = join(userDataDir, 'loginStatus.json')
  if (!existsSync(p)) return null
  try {
    const raw = readFileSync(p, 'utf-8')
    const obj = JSON.parse(raw) as { loggedIn?: boolean }
    if (typeof obj.loggedIn === 'boolean') return obj.loggedIn
  } catch (_e) {
    void _e
  }
  return null
}

export function setCachedLoginStatus(userDataDir: string, loggedIn: boolean): void {
  const p = join(userDataDir, 'loginStatus.json')
  try {
    writeFileSync(p, JSON.stringify({ loggedIn, at: new Date().toISOString() }), 'utf-8')
  } catch (_e) {
    void _e
  }
}
