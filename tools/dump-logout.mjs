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
console.log('url', page.url())
// try to find cog
const cogSels = ['#div_Main_TabSetting','[data-id="div_Main_TabSetting"]','[title="Cài đặt"]','[data-translate-title="STR_MENU_SETTING"]']
for(const sel of cogSels){
  const c=await page.locator(sel).count()
  console.log(`cog sel ${sel} count ${c}`)
  if(c>0){
    console.log('outer', (await page.locator(sel).first().evaluate(el=>el.outerHTML.slice(0,800))))
  }
}
const cog = page.locator('[data-id="div_Main_TabSetting"]').first()
console.log('cog count correct', await cog.count())
if(await cog.count()>0){
  await cog.click()
  console.log('clicked cog correct')
  await page.waitForTimeout(1500)
  const html = await page.content()
  const outDir = join(os.homedir(),'AppData','Roaming','zalo-auto','reports','debug2')
  mkdirSync(outDir,{recursive:true})
  writeFileSync(join(outDir,'after-cog.html'), html)
  await page.screenshot({path: join(outDir,'after-cog.png')})
  console.log('saved after-cog')
  const dump = await page.evaluate(()=>{
    const all = [...document.querySelectorAll('*')].map(el=>({
      tag:el.tagName,
      did:el.getAttribute('data-id'),
      title:el.getAttribute('title'),
      txt:(el.textContent||'').trim().slice(0,120),
      cls:el.className?.slice(0,80),
      outer:el.outerHTML.slice(0,600)
    })).filter(x=> x.txt.includes('Đăng') || x.txt.includes('Thoát') || x.txt.includes('Logout') || (x.did && x.did.includes('Logout')) || (x.did && x.did.includes('Setting')))
    const candidates = [...document.querySelectorAll('*')].filter(el=> (el.textContent||'').includes('Đăng xuất')).slice(0,10).map(el=>({
      tag:el.tagName, cls:el.className?.slice(0,80), txt:(el.textContent||'').trim().slice(0,150), outer:el.outerHTML.slice(0,800)
    }))
    const allTexts = [...document.querySelectorAll('div, button, span, a')].filter(el=> (el.textContent||'').match(/Đăng xuất|Log out|Thoát/i)).slice(0,20).map(el=>({tag:el.tagName, txt:el.textContent.trim().slice(0,100), outer:el.outerHTML.slice(0,600)}))
    return {all: all.slice(0,50), candidates, allTexts}
  })
  console.log(JSON.stringify(dump,null,2))
  writeFileSync(join(outDir,'after-cog-dump.json'), JSON.stringify(dump,null,2))
}
await page.waitForTimeout(2000)
await ctx.close()
