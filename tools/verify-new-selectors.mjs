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
const SEL = {
  input: '#contact-search-input',
  resultsContainer: '#searchResultList',
  resultRow: '#searchResultList [id^="friend-item-"], #searchResultList .conv-item',
  resultName: '.conv-item-title__name, .truncate',
  resultSubtitle: '.txt-highlight, .friend_online_status, .item-message'
}
console.log('input count', await page.locator(SEL.input).count())
console.log('resultsContainer count', await page.locator(SEL.resultsContainer).count())
console.log('resultRow count', await page.locator(SEL.resultRow).count())
const rows = page.locator(SEL.resultRow)
const n = await rows.count()
console.log('n', n)
for (let i=0;i<n;i++) {
  const row = rows.nth(i)
  console.log('row', i, await row.innerHTML().then(s=>s.slice(0,500)))
  const nameEl = row.locator(SEL.resultName).first()
  const nameCount = await nameEl.count()
  console.log(' name count', nameCount, nameCount? await nameEl.textContent().then(t=>t?.trim()) : 'none')
  const subEl = row.locator(SEL.resultSubtitle).first()
  const subCount = await subEl.count()
  console.log(' sub count', subCount, subCount? await subEl.textContent().then(t=>t?.trim()) : 'none')
}
// also test original old selector counts for comparison
console.log('old resultRow count', await page.locator('[class*="search-result"] [class*="user"], [data-id="search-result-item"]').count())
await page.waitForTimeout(2000)
await ctx.close()
