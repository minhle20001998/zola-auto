import { chromium } from 'playwright'
import { join } from 'path'
import os from 'os'

const userDataDir = join(os.homedir(), 'AppData', 'Roaming', 'zalo-auto', 'zalo-profile')
process.env.PLAYWRIGHT_BROWSERS_PATH = '0'
const ctx = await chromium.launchPersistentContext(userDataDir, { headless: false })
const page = ctx.pages()[0] ?? await ctx.newPage()
if (!page.url().includes('chat.zalo.me')) await page.goto('https://chat.zalo.me', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)

// search and open
const phone = process.argv[2] || '0946905560'
console.log('search', phone)
const input = page.locator('#contact-search-input').first()
await input.click()
await input.fill(phone)
await page.waitForTimeout(2500)
const rows = page.locator('#searchResultList [id^="friend-item-"]')
const n = await rows.count()
console.log('rows', n)
if (n>0) {
  for(let i=0;i<n;i++) {
    const txt = await rows.nth(i).textContent().then(t=>t?.trim().slice(0,200))
    console.log(i, txt)
  }
  await rows.first().click()
  await page.waitForTimeout(2500)
}

// now dump composer
const dump = await page.evaluate(() => {
  const allInputs = [...document.querySelectorAll('input[type="file"]')].map(el=>({outer: el.outerHTML.slice(0,600), id: el.id, cls: el.className}))
  const allComposer = [...document.querySelectorAll('[contenteditable], [role="textbox"], #richInput')].slice(0,5).map(el=>({tag:el.tagName, id:el.id, cls:el.className?.slice(0,100), role:el.getAttribute('role'), outer: el.outerHTML.slice(0,800)}))
  const attachBtns = [...document.querySelectorAll('button, [role="button"], i')].filter(el=> {
    const t=(el.textContent||'')+el.className+ (el.getAttribute('aria-label')||'')
    return /attach|file|image|picture|gửi|send/i.test(t)
  }).slice(0,10).map(el=>({tag:el.tagName, cls:el.className?.slice(0,80), aria:el.getAttribute('aria-label'), title:el.getAttribute('title'), outer: el.outerHTML.slice(0,600)}))
  const allBtns = [...document.querySelectorAll('button')].slice(0,20).map(el=>({cls:el.className?.slice(0,80), outer: el.outerHTML.slice(0,500)}))
  // find any element with data-id containing attach/file
  const dataIds = [...document.querySelectorAll('[data-id]')].slice(0,30).map(el=>({did:el.getAttribute('data-id'), cls:el.className?.slice(0,80), outer: el.outerHTML.slice(0,500)}))
  const composerHTML = document.querySelector('[contenteditable]')?.outerHTML.slice(0,2000) || document.querySelector('#richInput')?.outerHTML.slice(0,2000) || 'none'
  return {allInputs, allComposer, attachBtns, allBtns: allBtns.slice(0,10), dataIds: dataIds.slice(0,20), composerHTML}
})
console.log(JSON.stringify(dump, null, 2))
await page.screenshot({ path: join(os.homedir(),'AppData','Roaming','zalo-auto','reports','debug2','composer.png'), fullPage:false })
console.log('screenshot saved')
await page.waitForTimeout(4000)
await ctx.close()
