import { chromium } from 'playwright'
import { join } from 'path'
import os from 'os'
import { writeFileSync, mkdirSync } from 'fs'

const userDataDir = join(os.homedir(), 'AppData', 'Roaming', 'zalo-auto', 'zalo-profile')
process.env.PLAYWRIGHT_BROWSERS_PATH = '0'
const ctx = await chromium.launchPersistentContext(userDataDir, { headless: false })
const page = ctx.pages()[0] ?? await ctx.newPage()
if (!page.url().includes('chat.zalo.me')) await page.goto('https://chat.zalo.me', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
const phone = '0946905560'
const input = page.locator('#contact-search-input').first()
await input.click()
await input.fill(phone)
await page.waitForTimeout(2500)
let rows = page.locator('#searchResultList [id^="friend-item-"]')
let n = await rows.count()
console.log('rows', n)
if (n>0) {
  await rows.first().click()
  await page.waitForTimeout(2500)
}
console.log('opened chat, url', page.url())

// dump before attach
let before = await page.evaluate(() => ({ html: document.body.innerHTML.slice(0,3000) }))
console.log('before len', before.html.length)

// try file chooser attach
const imgPath = join(process.cwd(), 'test', '123-0946.905.560.jpg')
console.log('imgPath', imgPath, 'exists', await import('fs').then(m=>m.existsSync(imgPath)))
const trigger = page.locator('.fa-Photo_24_Line, .fa-Attach_24_Line').first()
console.log('trigger count', await trigger.count())
let chooser = null
try {
  const p = page.waitForEvent('filechooser', { timeout: 4000 }).catch(()=>null)
  await trigger.click().catch(()=>console.log('click fail'))
  chooser = await p
  console.log('chooser', !!chooser)
  if (chooser) {
    await chooser.setFiles(imgPath)
    console.log('setFiles done')
    await page.waitForTimeout(2000)
  }
} catch(e){ console.log('chooser err', e)}

 // fallback direct input if exists
 let fileInput = page.locator('input[type="file"]').first()
 console.log('fileInput count after', await fileInput.count())
 if (await fileInput.count()>0 && !chooser) {
   await fileInput.setInputFiles(imgPath)
   await page.waitForTimeout(1500)
 }

 // dump after attach
 const outDir = join(os.homedir(), 'AppData','Roaming','zalo-auto','reports','debug2')
 mkdirSync(outDir,{recursive:true})
 const html = await page.content()
 writeFileSync(join(outDir,'after-attach.html'), html)
 await page.screenshot({ path: join(outDir,'after-attach.png'), fullPage:true })
 console.log('saved after-attach html len', html.length)

 const dump = await page.evaluate(() => {
   const composer = document.querySelector('#richInput')
   const allInputs = [...document.querySelectorAll('input')].map(el=>({outer: el.outerHTML.slice(0,600), placeholder: el.getAttribute('placeholder'), id: el.id, cls: el.className.slice(0,80)}))
   const contentEditables = [...document.querySelectorAll('[contenteditable]')].map(el=>({outer: el.outerHTML.slice(0,800), id: el.id, cls: el.className.slice(0,80), ce: el.getAttribute('contenteditable')}))
   const previews = [...document.querySelectorAll('[class*="preview"], [class*="attachment"], [class*="image"], img[src^="blob:"]')].slice(0,10).map(el=>({tag:el.tagName, cls: el.className?.slice(0,80), outer: el.outerHTML.slice(0,800)}))
   const captionCandidates = [...document.querySelectorAll('input[placeholder], textarea, [contenteditable]')].map(el=>({tag:el.tagName, placeholder: el.getAttribute('placeholder'), outer: el.outerHTML.slice(0,700)}))
   const dataIds = [...document.querySelectorAll('[data-id]')].slice(0,50).map(el=>({did:el.getAttribute('data-id'), outer: el.outerHTML.slice(0,600)}))
   return {composer: composer?.outerHTML.slice(0,1500), allInputs, contentEditables: contentEditables.slice(0,10), previews, captionCandidates: captionCandidates.slice(0,20), dataIds: dataIds.slice(0,40)}
 })
 console.log(JSON.stringify(dump,null,2))
 writeFileSync(join(outDir,'after-attach-dump.json'), JSON.stringify(dump,null,2))

 await page.waitForTimeout(3000)
 await ctx.close()
