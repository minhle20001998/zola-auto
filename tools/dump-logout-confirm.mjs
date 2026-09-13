import { chromium } from 'playwright'
import { join } from 'path'
import os from 'os'
import { writeFileSync, mkdirSync } from 'fs'

const userDataDir = join(os.homedir(),'AppData','Roaming','zalo-auto','zalo-profile')
process.env.PLAYWRIGHT_BROWSERS_PATH='0'
const ctx = await chromium.launchPersistentContext(userDataDir,{headless:false})
const page = ctx.pages()[0] ?? await ctx.newPage()
if(!page.url().includes('chat.zalo.me')) await page.goto('https://chat.zalo.me',{waitUntil:'domcontentloaded'})
await page.waitForTimeout(2500)
const cog = page.locator('[data-id="div_Main_TabSetting"]').first()
await cog.click()
await page.waitForTimeout(1000)
const logout = page.locator('[data-id="div_TabSetting_Logout"]').first()
console.log('logout count', await logout.count())
if(await logout.count()>0){
  console.log('logout outer', await logout.evaluate(el=>el.outerHTML.slice(0,800)))
  await logout.click()
  console.log('clicked logout')
  await page.waitForTimeout(1500)
  const html = await page.content()
  const outDir = join(os.homedir(),'AppData','Roaming','zalo-auto','reports','debug2')
  mkdirSync(outDir,{recursive:true})
  writeFileSync(join(outDir,'after-logout-click.html'), html)
  await page.screenshot({path: join(outDir,'after-logout-click.png')})
  console.log('saved after logout click')
  const dump = await page.evaluate(()=>{
    const dialogs = [...document.querySelectorAll('[role="dialog"], .modal, .zmodal, .confirm, [class*="modal"], [class*="dialog"]')].slice(0,5).map(el=>({outer:el.outerHTML.slice(0,1000), txt:el.textContent?.slice(0,200)}))
    const btns = [...document.querySelectorAll('button, [role="button"]')].filter(el=> (el.textContent||'').includes('Đăng xuất')).slice(0,10).map(el=>({outer:el.outerHTML.slice(0,600), txt:el.textContent?.trim()}))
    const allBtns = [...document.querySelectorAll('button')].slice(0,20).map(el=>({outer:el.outerHTML.slice(0,500), txt:el.textContent?.trim().slice(0,50)}))
    const dataIds = [...document.querySelectorAll('[data-id]')].slice(0,50).map(el=>({did:el.getAttribute('data-id'), outer:el.outerHTML.slice(0,600)}))
    return {dialogs, btns, allBtns: allBtns.slice(0,15), dataIds: dataIds.slice(0,40)}
  })
  console.log(JSON.stringify(dump,null,2))
  writeFileSync(join(outDir,'after-logout-dump.json'), JSON.stringify(dump,null,2))
}
await page.waitForTimeout(2000)
// don't actually confirm logout to avoid logging out the user - just close without confirming
// await page.keyboard.press('Escape')
await ctx.close()
