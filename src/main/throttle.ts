export function randomDelayMs(minSec: number, maxSec: number): number {
  const min = Math.min(minSec, maxSec)
  const max = Math.max(minSec, maxSec)
  if (min === max) return Math.round(min * 1000)
  return Math.round((min + Math.random() * (max - min)) * 1000)
}

export function todayKey(d = new Date()): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function canSend(countToday: number, cap: number): boolean {
  if (cap === 0) return false
  return countToday < cap
}

export interface ThrottleState {
  date: string
  count: number
}

export function incrementCount(state: ThrottleState, dateKey: string): ThrottleState {
  if (state.date !== dateKey) return { date: dateKey, count: 1 }
  return { date: state.date, count: state.count + 1 }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
