const { writeFileSync, mkdirSync } = require('fs')
const { join } = require('path')

/** electron-builder afterPack hook — always emit resources/app-update.yml so updater never hangs */
exports.default = async function afterPack(context) {
  const publish = context.packager.config.publish
  const p = Array.isArray(publish) ? publish[0] : publish
  if (!p || p.provider !== 'github') return
  const appOutDir = context.appOutDir // e.g. dist/win-unpacked
  const out = join(appOutDir, 'resources', 'app-update.yml')
  const yml = `provider: ${p.provider}\nowner: ${p.owner}\nrepo: ${p.repo}\nupdaterCacheDirName: zalo-auto-updater\n`
  try {
    mkdirSync(join(appOutDir, 'resources'), { recursive: true })
    writeFileSync(out, yml, 'utf-8')
    console.log(`[afterPack] wrote ${out}`)
  } catch (e) {
    console.warn('[afterPack] failed to write app-update.yml', e)
  }
}
