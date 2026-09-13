import { chromium } from 'playwright'
import { join } from 'path'
import { writeFileSync, mkdirSync } from 'fs'
import os from 'os'

const userDataDir = join(os.homedir(), 'AppData', 'Roaming', 'zalo-auto', 'zalo-profile')
process.env.PLAYWRIGHT_BROWSERS_PATH = '0'
const ctx = await chromium.launchPersistentContext(userDataDir, { headless: false })
const page = ctx.pages()[0] ?? await ctx.newPage()
if (!page.url().includes('chat.zalo.me')) await page.goto('https://chat.zalo.me', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
console.log('URL', page.url())

const outDir = join(os.homedir(), 'AppData', 'Roaming', 'zalo-auto', 'reports', 'debug2')
mkdirSync(outDir, { recursive: true })

async function testPhone(phone) {
  const input = page.locator('#contact-search-input').first()
  await input.click()
  await input.press('Control+A')
  await input.press('Backspace')
  await input.fill('')
  await page.waitForTimeout(300)
  await input.type(phone, { delay: 80 })
  await page.waitForTimeout(2500)
  const html = await page.content()
  writeFileSync(join(outDir, `search-${phone}.html`), html)
  await page.screenshot({ path: join(outDir, `search-${phone}.png`), fullPage: true })
  const info = await page.evaluate(() => {
    const all = [...document.querySelectorAll('*')].map(el => ({
      tag: el.tagName,
      id: el.id,
      cls: el.className?.slice(0,120),
      did: el.getAttribute('data-id'),
      txt: (el.textContent||'').trim().slice(0,120),
      outer: el.outerHTML.slice(0,400)
    })).filter(x => x.txt.includes('096') || x.txt.includes('Search') || x.cls.includes('search') || x.cls.includes('result') || x.did)
    // specific search
    const selectors = [
      '[class*="search-result"]',
      '[class*="result"]',
      '[data-id*="search"]',
      '[data-id*="result"]',
      '[class*="contact"]',
      '[class*="user"]',
      '.search-result',
      '#search-result',
      '[role="listbox"]',
      '[role="option"]'
    ]
    const counts = {}
    for (const s of selectors) {
      try { counts[s] = document.querySelectorAll(s).length } catch { counts[s] = -1 }
    }
    // also dump all elements that contain phone substring
    const phoneEls = [...document.querySelectorAll('*')].filter(el => (el.textContent||'').includes('0964460331')).slice(0,10).map(el=>({tag:el.tagName, cls:el.className?.slice(0,80), outer: el.outerHTML.slice(0,500)}))
    return { info: all.slice(0,50), counts, phoneEls, bodyLen: document.body.innerHTML.length }
  })
  console.log(`=== phone ${phone} counts`, info.counts)
  console.log('phoneEls', JSON.stringify(info.phoneEls, null,2))
  writeFileSync(join(outDir, `info-${phone}.json`), JSON.stringify(info, null,2))
}

await testPhone('0964460331')
await testPhone('0964 460 331')
await testPhone('84964460331')
// also try clearing and looking for empty
await page.waitForTimeout(2000)
await ctx.close()
console.log('done')
