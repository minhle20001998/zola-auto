import { chromium } from 'playwright'
import { join } from 'path'
import os from 'os'
import { readFileSync } from 'fs'

const userDataDir = join(os.homedir(),'AppData','Roaming','zalo-auto','zalo-profile')
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
if(await rows.count()>0){ await rows.first().click(); await page.waitForTimeout(2500)}
console.log('opened chat')
const img=join(process.cwd(),'test','123-0946.905.560.jpg')
const payload=[{name:'123-0946.905.560.jpg', data: readFileSync(img).toString('base64'), mime:'image/jpeg'}]
console.log('payload ready', payload[0].data.length)
const composer=page.locator('#richInput').first()
await composer.click().catch(()=>{})
await page.waitForTimeout(300)
await page.evaluate(async(files)=>{
  const el=document.querySelector('#richInput')
  el.focus()
  const dt=new DataTransfer()
  for(const f of files){
    const binary=atob(f.data)
    const bytes=new Uint8Array(binary.length)
    for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i)
    const blob=new Blob([bytes],{type:f.mime})
    const file=new File([blob],f.name,{type:f.mime})
    dt.items.add(file)
  }
  const pasteEvent=new ClipboardEvent('paste',{clipboardData: dt, bubbles:true, cancelable:true})
  el.dispatchEvent(pasteEvent)
  el.dispatchEvent(new DragEvent('drop',{dataTransfer: dt, bubbles:true}))
}, payload)
console.log('paste dispatched')
await page.waitForTimeout(1500)
let blobCount=await page.locator('img[src^="blob:"]').count()
console.log('blobCount after paste',blobCount)
let preview=await page.locator('[class*="preview"], [class*="attachment"]').count()
console.log('preview count',preview)
await page.screenshot({path: join(os.homedir(),'AppData','Roaming','zalo-auto','reports','debug2','paste.png')})
console.log('screenshot saved')
await page.waitForTimeout(2000)
await ctx.close()
