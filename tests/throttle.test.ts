import { describe, it, expect } from 'vitest'
import { randomDelayMs, todayKey, canSend, incrementCount } from '../src/main/throttle'

describe('randomDelayMs', () => {
  it('within bounds', () => {
    for (let i = 0; i < 50; i++) {
      const v = randomDelayMs(20, 60)
      expect(v).toBeGreaterThanOrEqual(20000)
      expect(v).toBeLessThanOrEqual(60000)
    }
  })
  it('equal min/max', () => {
    expect(randomDelayMs(5, 5)).toBe(5000)
  })
})

describe('canSend', () => {
  it('cap 0 blocks all', () => {
    expect(canSend(0, 0)).toBe(false)
    expect(canSend(10, 0)).toBe(false)
  })
  it('allows under cap', () => {
    expect(canSend(0, 50)).toBe(true)
    expect(canSend(49, 50)).toBe(true)
    expect(canSend(50, 50)).toBe(false)
  })
})

describe('incrementCount & todayKey', () => {
  it('increments same day', () => {
    expect(incrementCount({ date: '2026-01-01', count: 3 }, '2026-01-01')).toEqual({
      date: '2026-01-01',
      count: 4
    })
  })
  it('resets on new day', () => {
    expect(incrementCount({ date: '2026-01-01', count: 50 }, '2026-01-02')).toEqual({
      date: '2026-01-02',
      count: 1
    })
  })
  it('todayKey format', () => {
    const k = todayKey(new Date(2026, 0, 5))
    expect(k).toBe('2026-01-05')
  })
  it('date rollover reset: canSend after reset', () => {
    const state = { date: '2026-01-01', count: 50 }
    const next = incrementCount(state, '2026-01-02')
    expect(canSend(next.count, 50)).toBe(true)
  })
})
