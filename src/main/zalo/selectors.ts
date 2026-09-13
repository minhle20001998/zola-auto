import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

type SelectorEntry = string | { selector?: string; by?: string; value?: string }

type RawSelectors = Record<string, Record<string, SelectorEntry>>

export interface Selectors {
  login: { qrCanvas: string; loginUrlHint: string }
  app: { searchInput: string; loggedInRoot: string }
  search: { input: string; resultsContainer: string; resultRow: string; resultName: string; resultSubtitle: string; emptyMarker: string }
  chat: { headerName: string; composer: string; sendButton: string; attachButton: string; fileInput: string; attachmentPreview: string; outgoingBubble: string }
  settings: { cogButton: string; logoutItem: string; logoutConfirm: string }
}

const builtin: RawSelectors = {
  login: {
    qrCanvas: 'canvas, img[alt*="QR" i]',
    loginUrlHint: '/login'
  },
  app: {
    searchInput: '#contact-search-input',
    loggedInRoot: '#contact-search-input, #searchResultList, [data-id="chat-root"]'
  },
  search: {
    input: '#contact-search-input',
    resultsContainer: '#searchResultList',
    resultRow: '#searchResultList [id^="friend-item-"], #searchResultList .conv-item',
    resultName: '.conv-item-title__name, .truncate',
    resultSubtitle: '.txt-highlight, .friend_online_status, .item-message',
    emptyMarker: '.item-search__title'
  },
  chat: {
    headerName: '#header-title, [class*="header"] [class*="name"], .conv-title, .header-title',
    composer: '#richInput, [contenteditable="true"], div[role="textbox"], #input_line_0',
    sendButton: 'button:has-text("Gửi"), [data-id*="Send"], [icon*="Send"], [class*="send"] button, button[type="submit"]',
    attachButton: '.fa-Photo_24_Line, .fa-Attach_24_Line, [icon*="Photo"], [icon*="Attach"], [data-id*="Attach"], [data-id*="Photo"]',
    fileInput: 'input[type="file"]',
    attachmentPreview: '[class*="preview"], [class*="attachment"], [class*="image-preview"], img[src^="blob:"]',
    outgoingBubble: '[data-id*="SentMsg"], [id^="image-mCntr"], .chatImageMessage--audit, [data-id*="Sent"]'
  },
  settings: {
    cogButton: '[data-id="div_Main_TabSetting"]',
    logoutItem: '[data-id="div_TabSetting_Logout"]',
    logoutConfirm: '[data-id="btn_Logout_Logout"]'
  }
}

function entryToSelector(entry: SelectorEntry): string {
  if (typeof entry === 'string') return entry
  if (entry.selector) return entry.selector
  const by = entry.by ?? 'css'
  const value = entry.value ?? ''
  if (!value) return ''
  switch (by) {
    case 'id':
      return `#${value}`
    case 'data-id':
      return `[data-id="${value}"]`
    case 'class':
      return value.startsWith('.') ? value : `.${value}`
    case 'css':
    case 'selector':
      return value
    case 'url':
      return value
    default:
      return value
  }
}

function loadRaw(): RawSelectors {
  const candidates: string[] = []
  try {
    candidates.push(join(app.getPath('userData'), 'selectors.json'))
  } catch (_e) {
    void _e
  }
  try {
    candidates.push(join(process.resourcesPath, 'selectors.json'))
  } catch (_e) {
    void _e
  }
  candidates.push(join(process.cwd(), 'resources', 'selectors.json'))
  // In dev, __dirname is out/main, so go up two levels
  try {
    candidates.push(join(__dirname, '..', '..', 'resources', 'selectors.json'))
  } catch (_e) {
    void _e
  }
  candidates.push(join(__dirname, 'selectors.json'))

  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const raw = readFileSync(p, 'utf-8')
        const json = JSON.parse(raw)
        // Remove _comment and handle nested structure
        const cleaned: RawSelectors = {}
        for (const [group, vals] of Object.entries(json)) {
          if (group.startsWith('_')) continue
          if (typeof vals === 'object' && vals !== null) {
            cleaned[group] = vals as Record<string, SelectorEntry>
          }
        }
        if (Object.keys(cleaned).length > 0) {
          console.log(`[selectors] loaded from ${p}`)
          return cleaned
        }
      } catch (e) {
        console.warn(`[selectors] failed to load ${p}:`, String(e))
      }
    }
  }
  return builtin
}

function buildSEL(raw: RawSelectors): Selectors {
  const out: Record<string, Record<string, string>> = {}
  for (const [group, entries] of Object.entries(raw)) {
    out[group] = {}
    for (const [key, entry] of Object.entries(entries)) {
      const sel = entryToSelector(entry as SelectorEntry)
      if (sel) out[group]![key] = sel
    }
  }
  // Fill missing groups/keys from builtin
  for (const [group, entries] of Object.entries(builtin)) {
    if (!out[group]) out[group] = {}
    for (const [key, val] of Object.entries(entries)) {
      if (!out[group]![key]) out[group]![key] = val as string
    }
  }
  return out as unknown as Selectors
}

let raw = loadRaw()
const _SEL: Selectors = buildSEL(raw)

export const SEL: Selectors = _SEL

export function reloadSelectors(): Selectors {
  raw = loadRaw()
  const next = buildSEL(raw)
  // Mutate existing object so imports see the update without re-import
  for (const k of Object.keys(_SEL)) delete (_SEL as unknown as Record<string, unknown>)[k]
  for (const [k, v] of Object.entries(next)) (_SEL as unknown as Record<string, unknown>)[k] = v
  console.log('[selectors] reloaded', _SEL)
  return _SEL
}

export function getSelectorsPath(): string | null {
  const candidates: string[] = []
  try {
    candidates.push(join(app.getPath('userData'), 'selectors.json'))
  } catch (_e) {
    void _e
  }
  try {
    candidates.push(join(process.resourcesPath, 'selectors.json'))
  } catch (_e) {
    void _e
  }
  candidates.push(join(process.cwd(), 'resources', 'selectors.json'))
  for (const p of candidates) if (existsSync(p)) return p
  return null
}
