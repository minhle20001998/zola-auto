const { writeFileSync, mkdirSync, existsSync } = require('fs')
const { join } = require('path')

/**
 * electron-builder afterPack hook.
 *
 * 1. Always emit resources/app-update.yml (updater provider config).
 * 2. rcedit the app exe on Windows (icon + version metadata).
 *    electron-builder's own rcedit needs the winCodeSign archive, whose macOS
 *    symlinks cannot be extracted without admin/Developer Mode, so we do it here
 *    with the plain `rcedit` package (no admin required).
 */
exports.default = async function afterPack(context) {
  const publish = context.packager.config.publish
  const p = Array.isArray(publish) ? publish[0] : publish
  const appOutDir = context.appOutDir

  if (p && p.provider === 'github') {
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

  if (context.electronPlatformName !== 'win32') return

  const exeName = `${context.packager.appInfo.productFilename}.exe`
  const exePath = join(appOutDir, exeName)
  const iconPath = join(context.packager.projectDir, 'resources', 'icon.ico')
  const version = context.packager.appInfo.version

  if (!existsSync(exePath)) {
    console.warn(`[afterPack] exe not found, skip rcedit: ${exePath}`)
    return
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rcedit = require('rcedit')
    await rcedit(exePath, {
      icon: existsSync(iconPath) ? iconPath : undefined,
      'file-version': version,
      'product-version': version,
      'version-string': {
        CompanyName: 'zalo-auto',
        FileDescription: 'zalo-auto',
        ProductName: 'zalo-auto',
        InternalName: 'zalo-auto',
        OriginalFilename: exeName
      }
    })
    console.log(`[afterPack] rcedit ${exePath} (icon + v${version})`)
  } catch (e) {
    console.warn('[afterPack] rcedit failed', e)
  }
}
