import { chromium } from 'playwright'
import { join } from 'path'
import os from 'os'

const userDataDir = join(os.homedir(),'AppData','Roaming','zalo-auto','zalo-profile')
process.env.PLAYWRIGHT_BROWSERS_PATH='0'
const ctx = await chromium.launchPersistentContext(userDataDir,{ headless:false, viewport:{width:1280,height:800}})
const page = ctx.pages()[0] ?? await ctx.newPage()
if(!page.url().includes('chat.zalo.me')) await page.goto('https://chat.zalo.me',{waitUntil:'domcontentloaded'})
await page.waitForTimeout(2500)
console.log('url', page.url())
const el=page.locator('#contact-search-input').first()
console.log('count',await el.count())
console.log('visible', await el.isVisible({timeout:1500}).catch(()=>false))
console.log('isLoggedIn would be', (await el.count())>0)
await ctx.close()
