import { chromium } from 'playwright'
import { join } from 'path'
import os from 'os'

const userDataDir = join(os.homedir(), 'AppData','Roaming','zalo-auto','zalo-profile')
process.env.PLAYWRIGHT_BROWSERS_PATH='0'
const ctx = await chromium.launchPersistentContext(userDataDir,{headless:false})
const page = ctx.pages()[0] ?? await ctx.newPage()
if(!page.url().includes('chat.zalo.me')) await page.goto('https://chat.zalo.me',{waitUntil:'domcontentloaded'})
await page.waitForTimeout(2500)
const phone='0946905560'
const input=page.locator('#contact-search-input').first()
await input.click()
await input.fill(phone)
await page.waitForTimeout(2500)
let rows=page.locator('#searchResultList [id^="friend-item-"]')
let n=await rows.count()
console.log('rows',n)
if(n>0){
  await rows.first().click()
  await page.waitForTimeout(2500)
}
console.log('opened', page.url())
// attach
const img=join(process.cwd(),'test','123-0946.905.560.jpg')
const trigger=page.locator('.fa-Photo_24_Line').first()
console.log('trigger',await trigger.count())
const chooserP=page.waitForEvent('filechooser',{timeout:4000}).catch(()=>null)
await trigger.click().catch(()=>{})
const chooser=await chooserP
console.log('chooser',!!chooser)
if(chooser){ await chooser.setFiles(img); console.log('setFiles'); await page.waitForTimeout(2000)}
else { console.log('no chooser, try input'); const inp=page.locator('input[type="file"]').first(); console.log('input count',await inp.count()); if(await inp.count()>0) await inp.setInputFiles(img) }

// check composer after attach
let html=await page.evaluate(()=>document.querySelector('#richInput')?.outerHTML.slice(0,1000))
console.log('composer after attach',html)
let previews=await page.locator('img[src^="blob:"]').count()
console.log('blob count',previews)

// fill caption
const caption='Test caption {id} debug'
const composer=page.locator('#richInput').first()
await composer.click()
await composer.press('Control+A')
await composer.press('Backspace')
await page.keyboard.type(caption,{delay:20})
await page.waitForTimeout(500)
console.log('filled caption')
html=await page.evaluate(()=>document.querySelector('#richInput')?.outerHTML.slice(0,1500))
console.log('composer after fill',html)
let txt=await page.evaluate(()=>document.querySelector('#richInput')?.textContent)
console.log('textContent',txt)

// try send via button or Enter
const btn=page.locator('button:has-text("Gửi"), [data-id*="Send"], [icon*="Send"]').first()
console.log('btn count',await btn.count())
if(await btn.count()>0 && await btn.isVisible().catch(()=>false)){
  console.log('clicking btn')
  await btn.click()
} else {
  console.log('press Enter')
  await composer.press('Enter')
}
await page.waitForTimeout(3000)
let after=await page.evaluate(()=>document.querySelector('#richInput')?.outerHTML.slice(0,1200))
console.log('composer after send',after)
let msgs=await page.locator('[data-id*="SentMsg"], .chatImageMessage--audit').count()
console.log('sent msgs count',msgs)
await page.screenshot({path: join(os.homedir(),'AppData','Roaming','zalo-auto','reports','debug2','test-send.png')})
console.log('screenshot saved')
await page.waitForTimeout(2000)
await ctx.close()
