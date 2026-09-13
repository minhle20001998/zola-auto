import { join, basename } from 'path'
import { mkdirSync, readFileSync, existsSync, writeFileSync, renameSync } from 'fs'
import type { Page } from 'playwright'
import type { AppConfig, WorkItem, RunReport, RecordStatus } from '../../shared/types'
import { HistoryStore } from '../store'
import { renderCaption } from '../template'
import { randomDelayMs, sleep, todayKey, canSend, incrementCount, type ThrottleState } from '../throttle'
import { buildReport, writeReport } from '../report'
import { getPage } from './browser'
import { isLoggedIn, waitForLogin, LoginTimeoutError, setCachedLoginStatus } from './login'
import { searchPhone, resolveCandidate, openChat, clearSearch } from './search'
import { attachImages, fillCaption, send, abortDraft, getChatName } from './compose'

export interface EngineOpts {
  config: AppConfig
  items: WorkItem[]
  userDataDir: string
  forceResend?: boolean
  onProgress?: (msg: { index: number; total: number; phone: string; status: RecordStatus }) => void
  onLog?: (entry: { level: 'info' | 'warn' | 'error'; at: string; message: string }) => void
  waitForPick?: (payload: { phone: string; candidates: { index: number; name: string; subtitle?: string }[] }) => Promise<number | 'skip'>
  waitForConfirm?: (payload: { phone: string; name: string; files: string[]; caption: string }) => Promise<{ action: 'send' | 'skip'; caption?: string } | 'send' | 'skip'>
  shouldStop?: () => boolean
}

export class DailyCapReached extends Error {
  constructor() {
    super('Daily cap reached')
    this.name = 'DailyCapReached'
  }
}

function log(opts: EngineOpts, level: 'info' | 'warn' | 'error', message: string): void {
  opts.onLog?.({ level, at: new Date().toISOString(), message })
}

async function awaitWithStop<T>(promise: Promise<T>, shouldStop?: () => boolean): Promise<T | 'stopped'> {
  if (!shouldStop) return promise
  return new Promise((resolve, reject) => {
    let done = false
    const id = setInterval(() => {
      if (shouldStop()) {
        done = true
        clearInterval(id)
        resolve('stopped' as unknown as T)
      }
    }, 200)
    promise
      .then((v) => {
        if (!done) {
          clearInterval(id)
          resolve(v)
        }
      })
      .catch((e) => {
        if (!done) {
          clearInterval(id)
          reject(e)
        }
      })
  })
}

async function sleepInterruptible(ms: number, shouldStop?: () => boolean, opts?: EngineOpts): Promise<void> {
  const step = 250
  let elapsed = 0
  while (elapsed < ms) {
    if (shouldStop?.()) {
      log(opts as EngineOpts, 'warn', 'Run stopped during delay')
      break
    }
    const wait = Math.min(step, ms - elapsed)
    await sleep(wait)
    elapsed += wait
  }
}

function loadThrottleState(userDataDir: string): ThrottleState {
  const p = join(userDataDir, 'throttle.json')
  try {
    if (!existsSync(p)) return { date: todayKey(), count: 0 }
    const raw = readFileSync(p, 'utf-8')
    const parsed = JSON.parse(raw) as ThrottleState
    if (parsed.date !== todayKey()) return { date: todayKey(), count: 0 }
    return parsed
  } catch {
    return { date: todayKey(), count: 0 }
  }
}

function saveThrottleState(userDataDir: string, state: ThrottleState): void {
  const p = join(userDataDir, 'throttle.json')
  const tmp = `${p}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8')
  try {
    renameSync(tmp, p)
  } catch {
    writeFileSync(p, JSON.stringify(state, null, 2), 'utf-8')
  }
}

export async function runEngine(opts: EngineOpts): Promise<RunReport> {
  const startedAt = new Date().toISOString()
  const reportItems: RunReport['items'] = []
  const store = new HistoryStore(join(opts.userDataDir, 'history.json'))
  store.load()
  let throttleState = loadThrottleState(opts.userDataDir)

  const zaloProfile = join(opts.userDataDir, 'zalo-profile')
  let page: Page | null = null

  const ensurePage = async (): Promise<Page> => {
    if (page) return page
    page = await getPage(zaloProfile)
    const logged = await isLoggedIn(page)
    if (!logged) {
      log(opts, 'info', 'Not logged in — waiting for QR scan')
      await waitForLogin(page, opts.config.loginTimeoutSec, (elapsed) => {
        log(opts, 'info', `Waiting for login: ${elapsed}s`)
      })
      setCachedLoginStatus(opts.userDataDir, true)
    } else {
      setCachedLoginStatus(opts.userDataDir, true)
    }
    return page
  }

  const total = opts.items.length

  let report: ReturnType<typeof buildReport> | null = null
  try {
    for (let idx = 0; idx < opts.items.length; idx++) {
      if (opts.shouldStop?.()) {
        log(opts, 'warn', 'Run stopped by user')
        break
      }

      const item = opts.items[idx]!
      const filename = basename(item.files[0]!)
      log(opts, 'info', `Processing ${idx + 1}/${total} phone=${item.phone}`)

      if (!opts.forceResend && store.hasSent(item.key)) {
        reportItems.push({ phone: item.phone, filename, status: 'skipped', detail: 'already sent' })
        opts.onProgress?.({ index: idx + 1, total, phone: item.phone, status: 'skipped' })
        continue
      }

      if (opts.config.mode !== 'debug') {
        const tk = todayKey()
        if (throttleState.date !== tk) throttleState = { date: tk, count: 0 }
        if (!canSend(throttleState.count, opts.config.dailyCap)) {
          log(opts, 'warn', `Daily cap ${opts.config.dailyCap} reached — stopping`)
          reportItems.push({ phone: item.phone, filename, status: 'skipped', detail: 'daily cap reached' })
          break
        }
      }

      try {
        if (opts.shouldStop?.()) {
          log(opts, 'warn', 'Run stopped by user')
          break
        }
        const pg = await ensurePage()
        if (opts.shouldStop?.()) {
          log(opts, 'warn', 'Run stopped by user')
          break
        }

        await pg.waitForTimeout(300 + Math.floor(Math.random() * 700))
        if (opts.shouldStop?.()) {
          log(opts, 'warn', 'Run stopped by user')
          break
        }

        const candidates = await searchPhone(pg, item.phone, item.rawPhone)
        const resolved = resolveCandidate(candidates)

        if (resolved.kind === 'empty') {
          log(opts, 'warn', `No results for ${item.phone}`)
          reportItems.push({ phone: item.phone, filename, status: 'not_found' })
          opts.onProgress?.({ index: idx + 1, total, phone: item.phone, status: 'not_found' })
          store.add({ key: item.key, filename, hash: item.key.split('::')[1] ?? '', phone: item.phone, id: item.id, status: 'not_found', at: new Date().toISOString() })
          await clearSearch(pg).catch(() => {})
          continue
        }

        let picked = resolved.kind === 'single' ? resolved.candidate : null
        if (resolved.kind === 'multiple') {
          if (!opts.waitForPick) {
            reportItems.push({ phone: item.phone, filename, status: 'skipped', detail: 'multiple candidates — no picker' })
            await clearSearch(pg).catch(() => {})
            continue
          }
          if (opts.shouldStop?.()) {
            log(opts, 'warn', 'Run stopped by user')
            break
          }
          log(opts, 'info', `Multiple candidates for ${item.phone} — waiting for user pick`)
          const pickedChoice = await awaitWithStop(opts.waitForPick({ phone: item.phone, candidates: resolved.candidates }), opts.shouldStop)
          if (pickedChoice === 'stopped') {
            log(opts, 'warn', 'Run stopped by user')
            break
          }
          const choice = pickedChoice as number | 'skip'
          if (choice === 'skip') {
            reportItems.push({ phone: item.phone, filename, status: 'rejected' })
            opts.onProgress?.({ index: idx + 1, total, phone: item.phone, status: 'rejected' })
            store.add({ key: item.key, filename, hash: item.key.split('::')[1] ?? '', phone: item.phone, id: item.id, status: 'rejected', at: new Date().toISOString() })
            await clearSearch(pg).catch(() => {})
            continue
          }
          const found = resolved.candidates.find((c) => c.index === choice)
          if (!found) {
            reportItems.push({ phone: item.phone, filename, status: 'rejected' })
            await clearSearch(pg).catch(() => {})
            continue
          }
          picked = found
        }

        if (!picked) {
          reportItems.push({ phone: item.phone, filename, status: 'failed', detail: 'no candidate' })
          continue
        }

        if (opts.shouldStop?.()) {
          log(opts, 'warn', 'Run stopped by user')
          break
        }
        await openChat(pg, picked)
        if (opts.shouldStop?.()) {
          log(opts, 'warn', 'Run stopped by user')
          break
        }
        await pg.waitForTimeout(300 + Math.floor(Math.random() * 400))
        if (opts.shouldStop?.()) {
          log(opts, 'warn', 'Run stopped by user')
          break
        }

        const name = await getChatName(pg)
        const captionRes = renderCaption(opts.config.captionTemplate, {
          id: item.id,
          phone: item.phone,
          filename,
          name,
          index: idx + 1,
          total
        })
        if (captionRes.unknownTokens.length > 0) {
          log(opts, 'warn', `Unknown caption tokens: ${captionRes.unknownTokens.join(', ')}`)
        }

        if (opts.config.mode === 'debug') {
          if (opts.waitForConfirm) {
            if (opts.shouldStop?.()) {
              log(opts, 'warn', 'Run stopped by user')
              break
            }
            const rawResult = await awaitWithStop(opts.waitForConfirm({ phone: item.phone, name, files: item.files, caption: captionRes.text }), opts.shouldStop)
            if (rawResult === 'stopped') {
              log(opts, 'warn', 'Run stopped by user')
              break
            }
            const result = rawResult as { action: 'send' | 'skip'; caption?: string } | 'send' | 'skip'
            const action = typeof result === 'string' ? result : result.action
            if (action === 'skip') {
              reportItems.push({ phone: item.phone, filename, status: 'rejected' })
              opts.onProgress?.({ index: idx + 1, total, phone: item.phone, status: 'rejected' })
            } else {
              reportItems.push({ phone: item.phone, filename, status: 'skipped', detail: 'debug confirmed' })
              opts.onProgress?.({ index: idx + 1, total, phone: item.phone, status: 'skipped' })
            }
          } else {
            reportItems.push({ phone: item.phone, filename, status: 'skipped', detail: 'debug' })
          }
          await clearSearch(pg).catch(() => {})
          continue
        }

        if (opts.shouldStop?.()) {
          log(opts, 'warn', 'Run stopped by user')
          break
        }
        await attachImages(pg, item.files)
        if (opts.shouldStop?.()) {
          log(opts, 'warn', 'Run stopped by user')
          await abortDraft(pg).catch(() => {})
          break
        }

        let captionToSend = captionRes.text
        if (opts.shouldStop?.()) {
          log(opts, 'warn', 'Run stopped by user')
          break
        }
        if (opts.config.mode === 'confirm') {
          if (opts.shouldStop?.()) {
            log(opts, 'warn', 'Run stopped by user')
            break
          }
          if (!opts.waitForConfirm) throw new Error('waitForConfirm required in confirm mode')
          const rawResult = await awaitWithStop(opts.waitForConfirm({ phone: item.phone, name, files: item.files, caption: captionRes.text }), opts.shouldStop)
          if (rawResult === 'stopped') {
            log(opts, 'warn', 'Run stopped by user')
            break
          }
          const result = rawResult as { action: 'send' | 'skip'; caption?: string } | 'send' | 'skip'
          const action = typeof result === 'string' ? result : result.action
          const editedCaption = typeof result === 'string' ? undefined : result.caption
          if (action === 'skip') {
            await abortDraft(pg)
            reportItems.push({ phone: item.phone, filename, status: 'rejected' })
            opts.onProgress?.({ index: idx + 1, total, phone: item.phone, status: 'rejected' })
            store.add({ key: item.key, filename, hash: item.key.split('::')[1] ?? '', phone: item.phone, id: item.id, status: 'rejected', at: new Date().toISOString() })
            await clearSearch(pg).catch(() => {})
            continue
          }
          if (editedCaption !== undefined) captionToSend = editedCaption
        }
        if (opts.shouldStop?.()) {
          log(opts, 'warn', 'Run stopped by user')
          await abortDraft(pg).catch(() => {})
          break
        }
        await fillCaption(pg, captionToSend)
        if (opts.shouldStop?.()) {
          log(opts, 'warn', 'Run stopped by user')
          await abortDraft(pg).catch(() => {})
          break
        }

        const sent = await send(pg)
        if (!sent) throw new Error('Send confirmation failed — outgoing bubble not found')

        throttleState = incrementCount(throttleState, todayKey())
        saveThrottleState(opts.userDataDir, throttleState)

        store.add({ key: item.key, filename, hash: item.key.split('::')[1] ?? '', phone: item.phone, id: item.id, status: 'sent', at: new Date().toISOString() })
        reportItems.push({ phone: item.phone, filename, status: 'sent' })
        opts.onProgress?.({ index: idx + 1, total, phone: item.phone, status: 'sent' })

        const delay = randomDelayMs(opts.config.delayMinSec, opts.config.delayMaxSec)
        log(opts, 'info', `Sent to ${item.phone} — waiting ${Math.round(delay / 1000)}s`)
        await sleepInterruptible(delay, opts.shouldStop, opts)
        if (opts.shouldStop?.()) {
          log(opts, 'warn', 'Run stopped by user')
          break
        }
        await clearSearch(pg).catch(() => {})
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const isFatal = e instanceof LoginTimeoutError || msg.includes('profile locked') || msg.includes('browser')
        if (isFatal) {
          log(opts, 'error', `Fatal: ${msg}`)
          reportItems.push({ phone: item.phone, filename, status: 'failed', detail: msg })
          break
        }
        log(opts, 'error', `Failed for ${item.phone}: ${msg}`)
        try {
          const pg: Page | null = page
          if (pg) {
            const dir = join(opts.userDataDir, 'reports', 'screenshots')
            mkdirSync(dir, { recursive: true })
            await (pg as unknown as { screenshot: (o: unknown) => Promise<void> }).screenshot({ path: join(dir, `${Date.now()}-${item.phone}.png`) }).catch(() => {})
          }
        } catch (_e) {
          void _e
        }
        store.add({ key: item.key, filename, hash: item.key.split('::')[1] ?? '', phone: item.phone, id: item.id, status: 'failed', at: new Date().toISOString(), error: msg })
        reportItems.push({ phone: item.phone, filename, status: 'failed', detail: msg })
        opts.onProgress?.({ index: idx + 1, total, phone: item.phone, status: 'failed' })
        if (page) await clearSearch(page).catch(() => {})
      }
    }
  } finally {
    const finishedAt = new Date().toISOString()
    report = buildReport(startedAt, finishedAt, opts.config.mode, reportItems)
    try {
      const out = writeReport(opts.userDataDir, report)
      log(opts, 'info', `Report written: ${out.jsonPath}`)
    } catch (_e) {
      void _e
    }
  }
  return report!
}
