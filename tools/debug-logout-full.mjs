import { chromium } from 'playwright'
import { join } from 'path'
import os from 'os'
import { writeFileSync, mkdirSync } from 'fs'

const userDataDir = join(os.homedir(),'AppData','Roaming','zalo-auto','zalo-profile')
process.env.PLAYWRIGHT_BROWSERS_PATH='0'
console.log('launching', userDataDir)
const ctx = await chromium.launchPersistentContext(userDataDir,{ headless:false, viewport:{width:1280,height:800}})
const page = ctx.pages()[0] ?? await ctx.newPage()
if(!page.url().includes('chat.zalo.me')){
  await page.goto('https://chat.zalo.me',{waitUntil:'domcontentloaded'})
}
await page.waitForTimeout(2500)
console.log('url', page.url(), 'title', await page.title())

async function isLoggedIn(page){
  const url=page.url()
  if(url.includes('id.zalo.me')) return false
  const el=page.locator('#contact-search-input').first()
  const c=await el.count()
  if(c>0){
    try{ if(await el.isVisible({timeout:1500})) return true }catch{}
    return true
  }
  const root=page.locator('#contact-search-input, #searchResultList').first()
  if(await root.count()>0) return true
  return false
}

console.log('isLoggedIn before', await isLoggedIn(page))

const outDir=join(os.homedir(),'AppData','Roaming','zalo-auto','reports','debug-logout')
mkdirSync(outDir,{recursive:true})
let html=await page.content()
writeFileSync(join(outDir,'01-before.html'), html)
await page.screenshot({path: join(outDir,'01-before.png')})
console.log('saved before')

// click cog
const cogSel='[data-id="div_Main_TabSetting"]'
let cog=page.locator(cogSel).first()
console.log('cog count', await cog.count())
if(await cog.count()>0){
  await cog.click({timeout:5000}).catch(async e=>{console.log('locator click fail',e.message); await page.evaluate(()=>{ const el=document.querySelector('[data-id="div_Main_TabSetting"]'); el?.click()}); console.log('evaluate click done')})
  await page.waitForTimeout(1000)
  html=await page.content()
  writeFileSync(join(outDir,'02-after-cog.html'), html)
  await page.screenshot({path: join(outDir,'02-after-cog.png')})
  console.log('after cog, html len', html.length)
  // find logout
  let logout=page.locator('[data-id="div_TabSetting_Logout"]').first()
  let cnt=await logout.count()
  console.log('logout count', cnt)
  if(cnt===0){
    const ids=await page.evaluate(()=> [...document.querySelectorAll('[data-id]')].map(e=>e.getAttribute('data-id')).join(', ').slice(0,500))
    console.log('ids', ids)
  } else {
    console.log('logout outer', await logout.evaluate(e=>e.outerHTML.slice(0,600)))
    try{
      await logout.waitFor({state:'visible',timeout:5000})
      console.log('logout visible')
    }catch(e){console.log('wait visible fail',e.message)}
    await logout.click({timeout:5000}).catch(async e=>{console.log('click fail',e.message); await page.evaluate(()=>document.querySelector('[data-id="div_TabSetting_Logout"]')?.click()); console.log('evaluate click logout done')})
    await page.waitForTimeout(1000)
    html=await page.content()
    writeFileSync(join(outDir,'03-after-logout-click.html'), html)
    await page.screenshot({path: join(outDir,'03-after-logout-click.png')})
    console.log('after logout click, len', html.length)
    // confirm
    let confirm=page.locator('[data-id="btn_Logout_Logout"]').first()
    let ccnt=await confirm.count()
    console.log('confirm count', ccnt)
    if(ccnt>0){
      console.log('confirm outer', await confirm.evaluate(e=>e.outerHTML.slice(0,600)))
      let vis=false
      try{ vis=await confirm.isVisible({timeout:2000})}catch{}
      console.log('confirm visible', vis)
      if(vis){
        await confirm.click({timeout:3000}).catch(async e=>{console.log('confirm click fail',e.message); await page.evaluate(()=>document.querySelector('[data-id="btn_Logout_Logout"]')?.click())})
        console.log('clicked confirm')
      } else {
        await page.evaluate(()=>document.querySelector('[data-id="btn_Logout_Logout"]')?.click())
        console.log('evaluate click confirm (not visible)')
      }
      await page.waitForTimeout(2000)
      html=await page.content()
      writeFileSync(join(outDir,'04-after-confirm.html'), html)
      await page.screenshot({path: join(outDir,'04-after-confirm.png')})
      console.log('after confirm, url', page.url())
      console.log('isLoggedIn after', await isLoggedIn(page))
      // check for QR
      let qrCount=await page.locator('canvas, img[alt*="QR" i]').count()
      console.log('qr count', qrCount)
      let qrHtml=await page.evaluate(()=> document.documentElement.outerHTML.slice(0,2000))
      console.log('qr html preview', qrHtml.slice(0,500))
    } else {
      console.log('no confirm found')
      const ids2=await page.evaluate(()=> [...document.querySelectorAll('[data-id]')].map(e=>e.getAttribute('data-id')).slice(0,40).join(', '))
      console.log('ids after logout click', ids2)
    }
  }
} else {
  console.log('cog not found')
}

await page.waitForTimeout(3000)
await ctx.close()
console.log('done')
