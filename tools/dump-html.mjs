import { chromium } from 'playwright'
import { join } from 'path'
import { writeFileSync, mkdirSync } from 'fs'
import os from 'os'

const userDataDir = join(os.homedir(), 'AppData', 'Roaming', 'zalo-auto', 'zalo-profile')
console.log('userDataDir', userDataDir)

process.env.PLAYWRIGHT_BROWSERS_PATH = '0'

try {
  const ctx = await chromium.launchPersistentContext(userDataDir, { headless: false })
  const page = ctx.pages()[0] ?? await ctx.newPage()
  if (!page.url().includes('chat.zalo.me')) {
    await page.goto('https://chat.zalo.me', { waitUntil: 'domcontentloaded', timeout: 15000 })
  }
  await page.waitForTimeout(3000)
  console.log('URL', page.url())
  console.log('title', await page.title())

  // dump outerHTML
  const html = await page.content()
  const outDir = join(os.homedir(), 'AppData', 'Roaming', 'zalo-auto', 'reports', 'debug')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'page.html'), html, 'utf-8')
  console.log('saved html to', join(outDir, 'page.html'), 'len', html.length)

  // screenshot
  await page.screenshot({ path: join(outDir, 'page.png'), fullPage: true })
  console.log('screenshot saved')

  // try to find search input candidates
  const candidates = await page.evaluate(() => {
    const allInputs = [...document.querySelectorAll('input')].map((el, i) => ({
      idx: i,
      placeholder: el.getAttribute('placeholder'),
      id: el.id,
      className: el.className,
      type: el.type,
      outer: el.outerHTML.slice(0, 300)
    }))
    const allDivs = [...document.querySelectorAll('[class*="search" i]')].slice(0, 20).map(el => ({ tag: el.tagName, className: el.className, txt: (el.textContent||'').slice(0,100) }))
    return { allInputs, allDivs, bodyPreview: document.body.innerHTML.slice(0, 2000) }
  })
  console.log(JSON.stringify(candidates, null, 2))
  writeFileSync(join(outDir, 'candidates.json'), JSON.stringify(candidates, null, 2))

  // Try typing a phone to see results DOM change
  const searchSels = ['input[placeholder*="Tìm" i]', 'input[placeholder*="Search" i]', '#contact-search-input', 'input[type="search"]', 'input']
  for (const sel of searchSels) {
    const loc = page.locator(sel).first()
    if (await loc.count().then(c=>c>0)) {
      console.log('Found input with sel', sel)
      await loc.click().catch(()=>{})
      await loc.fill('0964460331').catch(()=>{})
      await page.waitForTimeout(2000)
      const after = await page.evaluate(() => document.body.innerHTML.slice(0, 5000))
      writeFileSync(join(outDir, `after-${sel.replace(/[^a-z0-9]/gi,'_')}.html`), after)
      await page.screenshot({ path: join(outDir, `after-${sel.replace(/[^a-z0-9]/gi,'_')}.png`) })
      break
    }
  }

  // keep open 5s then close
  await page.waitForTimeout(5000)
  await ctx.close()
} catch (e) {
  console.error('ERR', e)
  process.exit(1)
}
