import { PNG } from 'pngjs'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const size = 512
const png = new PNG({ width: size, height: size })

// Zalo blue #1890ff = 24,144,255
const bgR = 24, bgG = 144, bgB = 255
// White for Z
const fgR = 255, fgG = 255, fgB = 255

for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const idx = (size * y + x) << 2
    // rounded rect background with 80px radius
    const margin = 32
    const radius = 80
    let inside = true
    // simple rounded rect check
    if ((x < margin + radius && y < margin + radius) && ((x - (margin+radius))**2 + (y - (margin+radius))**2 > radius*radius)) inside = false
    if ((x > size - margin - radius && y < margin + radius) && ((x - (size-margin-radius))**2 + (y - (margin+radius))**2 > radius*radius)) inside = false
    if ((x < margin + radius && y > size - margin - radius) && ((x - (margin+radius))**2 + (y - (size-margin-radius))**2 > radius*radius)) inside = false
    if ((x > size - margin - radius && y > size - margin - radius) && ((x - (size-margin-radius))**2 + (y - (size-margin-radius))**2 > radius*radius)) inside = false
    if (x < margin || x >= size - margin || y < margin || y >= size - margin) inside = false

    let isZ = false
    if (inside) {
      // Draw Z: top bar, bottom bar, diagonal
      const thickness = 48
      const pad = 90
      // top bar
      if (y >= pad && y < pad + thickness && x >= pad && x < size - pad) isZ = true
      // bottom bar
      if (y >= size - pad - thickness && y < size - pad && x >= pad && x < size - pad) isZ = true
      // diagonal: from top-right to bottom-left
      // line equation: x + y = size, with thickness
      const dist = Math.abs((x + y) - size) / Math.SQRT2
      if (dist < thickness/2 && x >= pad && x < size - pad && y >= pad && y < size - pad) {
        // only within the Z bounds, not outside
        if (x > pad + 20 && x < size - pad - 20) isZ = true
      }
    }

    if (isZ) {
      png.data[idx] = fgR
      png.data[idx+1] = fgG
      png.data[idx+2] = fgB
      png.data[idx+3] = 255
    } else if (inside) {
      png.data[idx] = bgR
      png.data[idx+1] = bgG
      png.data[idx+2] = bgB
      png.data[idx+3] = 255
    } else {
      png.data[idx] = 0
      png.data[idx+1] = 0
      png.data[idx+2] = 0
      png.data[idx+3] = 0
    }
  }
}

mkdirSync('resources', { recursive: true })
const outPng = 'resources/icon.png'
const buffer = PNG.sync.write(png)
writeFileSync(outPng, buffer)
console.log('wrote', outPng, buffer.length)

// also write 256, 128, 64, 32 variants for favicon
for (const s of [256, 128, 64, 32, 16]) {
  const p = new PNG({ width: s, height: s })
  // simple downscale by sampling
  for (let y=0;y<s;y++) for(let x=0;x<s;x++){
    const sx = Math.floor(x * size / s)
    const sy = Math.floor(y * size / s)
    const sIdx = (size * sy + sx) << 2
    const dIdx = (s * y + x) << 2
    p.data[dIdx]=png.data[sIdx]
    p.data[dIdx+1]=png.data[sIdx+1]
    p.data[dIdx+2]=png.data[sIdx+2]
    p.data[dIdx+3]=png.data[sIdx+3]
  }
  const b = PNG.sync.write(p)
  const name = s===16 ? 'resources/favicon-16x16.png' : s===32 ? 'resources/favicon-32x32.png' : `resources/icon-${s}.png`
  writeFileSync(name, b)
  console.log('wrote', name)
}

// also copy 256 as favicon
import { copyFileSync } from 'fs'
copyFileSync('resources/icon-256.png', 'resources/favicon.png')
copyFileSync('resources/icon.png', 'src/renderer/favicon.png')
console.log('copied favicons')
