import { chromium } from 'playwright'
import { join } from 'path'
import os from 'os'

const userDataDir = join(os.homedir(), 'AppData','Roaming','zalo-auto','zalo-profile')
process.env.PLAYWRIGHT_BROWSERS_PATH='0'
const { chromium: ch } = await import('playwright')
const browsersPath = '0'
process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath
console.log('launch headless')
let ctx
try {
  ctx = await ch.launchPersistentContext(userDataDir, { headless: true, viewport: { width: 1280, height: 800 }, args: ['--disable-blink-features=AutomationControlled'] })
} catch(e){ console.error('launch err', e.message); process.exit(1)}
const page = ctx.pages()[0] ?? await ctx.newPage()
if (!page.url().includes('chat.zalo.me')) {
  await page.goto('https://chat.zalo.me', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(()=>{})
}
await page.waitForTimeout(2000)
console.log('url', page.url())
// check isLoggedIn logic
const sel = '#contact-search-input'
const el = page.locator(sel).first()
let visible = false
try { visible = await el.isVisible({ timeout: 1500 }) } catch {}
console.log('searchInput visible', visible, 'count', await el.count())
const loggedInRoot = page.locator('#contact-search-input, #searchResultList, [data-id="chat-root"]').first()
let rootVis = false
try { rootVis = await loggedInRoot.isVisible({ timeout: 1500 }) } catch {}
console.log('loggedInRoot visible', rootVis)
const isLoggedIn = visible || rootVis
console.log('isLoggedIn', isLoggedIn)
await ctx.close()
