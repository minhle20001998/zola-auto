import { chromium } from 'playwright'
import { join } from 'path'
import os from 'os'

const userDataDir = join(os.homedir(), 'AppData', 'Roaming', 'zalo-auto', 'zalo-profile')
process.env.PLAYWRIGHT_BROWSERS_PATH = '0'
const ctx = await chromium.launchPersistentContext(userDataDir, { headless: false })
const page = ctx.pages()[0] ?? await ctx.newPage()
if (!page.url().includes('chat.zalo.me')) await page.goto('https://chat.zalo.me', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
const input = page.locator('#contact-search-input').first()
await input.click()
await input.fill('0964460331')
await page.waitForTimeout(2500)
const info = await page.evaluate(() => {
  const list = document.querySelector('#searchResultList')
  if (!list) return { err: 'no searchResultList' }
  const rows = [...list.querySelectorAll('[role="grid"] [role="row"], [class*="ReactVirtualized"] [role="row"], .ReactVirtualized__Grid *')]
  const rowDetails = [...list.querySelectorAll('*')].slice(0,200).map(el=>({
    tag: el.tagName,
    role: el.getAttribute('role'),
    cls: el.className?.slice(0,100),
    did: el.getAttribute('data-id'),
    txt: (el.textContent||'').trim().slice(0,150).replace(/\s+/g,' '),
    html: el.outerHTML.slice(0,600)
  })).filter(x=> x.txt.length>3)
  // also direct children of grid
  const grid = document.querySelector('.ReactVirtualized__Grid')
  const gridInfo = grid ? {
    html: grid.outerHTML.slice(0,2000),
    childCount: grid.children.length,
    inner: grid.innerHTML.slice(0,3000)
  } : null
  // list all elements with text containing 096
  const phoneContainers = [...document.querySelectorAll('*')].filter(el=> (el.textContent||'').includes('0964460331')).slice(0,5).map(el=>({tag:el.tagName, cls:el.className?.slice(0,80), html: el.outerHTML.slice(0,800)}))
  return { listHtml: list.outerHTML.slice(0,5000), gridInfo, rowDetails: rowDetails.slice(0,30), phoneContainers }
})
console.log(JSON.stringify(info, null, 2))
await ctx.close()
