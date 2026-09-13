import type { Page } from 'playwright'
import { SEL } from './selectors'
import type { CandidateInfo } from '../../shared/types'

export interface Candidate extends CandidateInfo {
  elementIndex: number
}

export async function searchPhone(page: Page, phone: string, rawPhone?: string): Promise<Candidate[]> {
  const input = page.locator(SEL.search.input).first()
  await input.click({ timeout: 8000 })
  await input.press('Control+A')
  await input.press('Backspace')
  await input.fill('')
  await page.waitForTimeout(300)
  await input.type(phone, { delay: 80 })
  await page.waitForTimeout(1200)

  let candidates = await readCandidates(page)
  if (candidates.length === 0 && rawPhone && rawPhone !== phone) {
    const alt = normalizeAlt(phone, rawPhone)
    if (alt && alt !== phone) {
      await input.press('Control+A')
      await input.press('Backspace')
      await input.fill('')
      await page.waitForTimeout(300)
      await input.type(alt, { delay: 80 })
      await page.waitForTimeout(1200)
      candidates = await readCandidates(page)
    }
  }
  return candidates
}

function normalizeAlt(_phone: string, rawPhone: string): string | null {
  const digits = rawPhone.replace(/\D/g, '')
  if (digits.startsWith('84') && digits.length >= 11) return `0${digits.slice(2)}`
  if (digits.startsWith('0')) return `84${digits.slice(1)}`
  return null
}

async function readCandidates(page: Page): Promise<Candidate[]> {
  const timeout = 4000
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const rows = page.locator(SEL.search.resultRow)
      const count = await rows.count()
      if (count > 0) {
        const out: Candidate[] = []
        const seen = new Set<string>()
        for (let i = 0; i < count; i++) {
          const row = rows.nth(i)
          let name = ''
          let subtitle = ''
          try {
            const nameEl = row.locator(SEL.search.resultName).first()
            if (await nameEl.count() > 0) name = (await nameEl.textContent())?.trim() ?? ''
          } catch (_e) {
            void _e
          }
          try {
            const subEl = row.locator(SEL.search.resultSubtitle).first()
            if (await subEl.count() > 0) subtitle = (await subEl.textContent())?.trim() ?? ''
          } catch (_e) {
            void _e
          }
          if (!name) name = `Result ${i + 1}`
          const key = `${name}::${subtitle}`
          if (seen.has(key)) continue
          seen.add(key)
          out.push({ index: i, name, subtitle, elementIndex: i })
        }
        if (out.length > 0) return out
      }
      const empty = page.locator(SEL.search.emptyMarker)
      if ((await empty.count()) > 0 && (await empty.first().isVisible().catch(() => false))) {
        return []
      }
    } catch (_e) {
      void _e
    }
    await page.waitForTimeout(400)
  }
  return []
}

export type ResolveResult = { kind: 'single'; candidate: Candidate } | { kind: 'empty' } | { kind: 'multiple'; candidates: Candidate[] }

export function resolveCandidate(candidates: Candidate[]): ResolveResult {
  if (candidates.length === 0) return { kind: 'empty' }
  if (candidates.length === 1) return { kind: 'single', candidate: candidates[0]! }
  return { kind: 'multiple', candidates }
}

export async function openChat(page: Page, candidate: Candidate): Promise<void> {
  const rows = page.locator(SEL.search.resultRow)
  const row = rows.nth(candidate.elementIndex)
  await row.click({ timeout: 8000 })
  const composer = page.locator(SEL.chat.composer).first()
  await composer.waitFor({ state: 'visible', timeout: 10000 })
}

export async function clearSearch(page: Page): Promise<void> {
  try {
    const input = page.locator(SEL.search.input).first()
    await input.press('Control+A')
    await input.press('Backspace')
    await page.waitForTimeout(300)
  } catch (_e) {
    void _e
  }
}
