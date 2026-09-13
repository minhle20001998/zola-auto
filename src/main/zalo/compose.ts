/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'fs'
import { basename } from 'path'
import type { Page } from 'playwright'
import { SEL } from './selectors'

declare const document: any
declare const DataTransfer: any
declare const File: any
declare const ClipboardEvent: any

export async function getChatName(page: Page): Promise<string> {
  try {
    const el = page.locator(SEL.chat.headerName).first()
    if (await el.count() > 0) {
      const t = (await el.textContent())?.trim()
      if (t) return t
    }
  } catch (_e) {
    void _e
  }
  return ''
}

export async function attachImages(page: Page, paths: string[]): Promise<void> {
  // Primary: paste via clipboard (Ctrl+V) – no file dialog, no gallery
  try {
    const payload = paths.map((p) => {
      try {
        const data = readFileSync(p).toString('base64')
        const name = basename(p)
        const ext = name.split('.').pop()?.toLowerCase() ?? 'jpg'
        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
        return { name, data, mime }
      } catch {
        return null
      }
    }).filter(Boolean) as { name: string; data: string; mime: string }[]

    if (payload.length > 0) {
      const composer = page.locator(SEL.chat.composer).first()
      await composer.click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(300)
      await page.evaluate(
        async (files: { name: string; data: string; mime: string }[]) => {
          const el = document.querySelector('#richInput') as any
          if (!el) throw new Error('composer not found')
          el.focus()
          const dt = new DataTransfer()
          for (const f of files) {
            const binary = atob(f.data)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
            const blob = new Blob([bytes], { type: f.mime })
            const file = new File([blob], f.name, { type: f.mime })
            dt.items.add(file)
          }
          const pasteEvent = new ClipboardEvent('paste', { clipboardData: dt as unknown as any, bubbles: true, cancelable: true })
          el.dispatchEvent(pasteEvent)
        },
        payload
      )
      await page.waitForTimeout(1000)
      const preview = page.locator(SEL.chat.attachmentPreview).first()
      try {
        await preview.waitFor({ state: 'visible', timeout: 5000 })
      } catch (_e) {
        void _e
      }
      if ((await preview.count()) > 0) return
      if ((await page.locator('img[src^="blob:"]').count()) > 0) return
      // paste succeeded even if preview not detected by selector – return and let caller handle
      await page.waitForTimeout(500)
      return
    }
  } catch (_e) {
    void _e
  }

  // Fallback: hidden file input (no gallery click if paste failed)
  try {
    const trigger = page.locator(SEL.chat.attachButton).first()
    if ((await trigger.count()) > 0) {
      try {
        const chooserPromise = (page as any).waitForFileChooser
          ? (page as any).waitForFileChooser({ timeout: 4000 }).catch(() => null)
          : (page as any).waitForEvent('filechooser', { timeout: 4000 }).catch(() => null)
        const [chooser] = await Promise.all([
          chooserPromise,
          trigger.click({ timeout: 4000 }).catch(() => null)
        ])
        if (chooser) {
          await (chooser as any).setFiles(paths)
          await page.waitForTimeout(800)
          return
        }
      } catch (_e) {
        void _e
      }
    }
    const fileInput = page.locator(SEL.chat.fileInput).first()
    if ((await fileInput.count()) > 0) {
      await fileInput.setInputFiles(paths)
      await page.waitForTimeout(800)
      return
    }
  } catch (_e) {
    void _e
  }

  throw new Error('attach failed — paste and file input both failed')
}

export async function fillCaption(page: Page, text: string): Promise<void> {
  if (!text) return
  const composer = page.locator(SEL.chat.composer).first()
  await composer.click({ timeout: 5000 })
  await composer.press('Control+A')
  await composer.press('Backspace')
  await page.keyboard.type(text, { delay: 20 })
}

export async function send(page: Page): Promise<boolean> {
  const btn = page.locator(SEL.chat.sendButton).first()
  const composer = page.locator(SEL.chat.composer).first()
  const beforeCount = await page.locator(SEL.chat.outgoingBubble).count().catch(() => 0)
  if ((await btn.count()) > 0 && (await btn.isVisible().catch(() => false))) {
    await btn.click({ timeout: 5000 })
  } else {
    await composer.press('Enter')
  }
  try {
    await page.waitForFunction(
      ({ sel, before }: { sel: string; before: number }) => document.querySelectorAll(sel).length > before,
      { sel: SEL.chat.outgoingBubble, before: beforeCount },
      { timeout: 8000 }
    )
    return true
  } catch (_e) {
    void _e
    return false
  }
}

export async function abortDraft(page: Page): Promise<void> {
  try {
    const composer = page.locator(SEL.chat.composer).first()
    await composer.click({ timeout: 2000 }).catch(() => {})
    await composer.press('Control+A').catch(() => {})
    await composer.press('Backspace').catch(() => {})
    await page.keyboard.press('Escape').catch(() => {})
  } catch (_e) {
    void _e
  }
  try {
    const previews = page.locator(SEL.chat.attachmentPreview)
    const n = await previews.count()
    for (let i = 0; i < n; i++) {
      const closeBtn = previews.nth(i).locator('button, [aria-label*="close" i]').first()
      if ((await closeBtn.count()) > 0) await closeBtn.click().catch(() => {})
    }
  } catch (_e) {
    void _e
  }
}
