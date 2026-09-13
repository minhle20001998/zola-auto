import { describe, it, expect } from 'vitest'
import { resolveCandidate } from '../src/main/zalo/search'
import type { Candidate } from '../src/main/zalo/search'

function c(idx: number): Candidate {
  return { index: idx, name: `User ${idx}`, elementIndex: idx }
}

describe('resolveCandidate', () => {
  it('empty', () => {
    expect(resolveCandidate([])).toEqual({ kind: 'empty' })
  })
  it('single', () => {
    const r = resolveCandidate([c(0)])
    expect(r.kind).toBe('single')
    if (r.kind === 'single') expect(r.candidate.index).toBe(0)
  })
  it('multiple', () => {
    const r = resolveCandidate([c(0), c(1)])
    expect(r.kind).toBe('multiple')
  })
})
