import { describe, it, expect } from 'vitest'
import { renderCaption } from '../src/main/template'

const base = { id: '1234', phone: '0123456789', filename: '1234-0123456789.jpg', name: 'Nguyen', index: 7, total: 120 }

describe('renderCaption', () => {
  it('replaces each token', () => {
    expect(renderCaption('id {id} phone {phone}', base).text).toBe('id 1234 phone 0123456789')
    expect(renderCaption('{filename}', base).text).toBe('1234-0123456789.jpg')
    expect(renderCaption('{name}', base).text).toBe('Nguyen')
    expect(renderCaption('{index}/{total}', base).text).toBe('7/120')
  })
  it('case-insensitive', () => {
    expect(renderCaption('{ID} {Phone}', base).text).toBe('1234 0123456789')
  })
  it('unknown token left verbatim and listed', () => {
    const r = renderCaption('hi {unknown} {id}', base)
    expect(r.text).toBe('hi {unknown} 1234')
    expect(r.unknownTokens).toContain('unknown')
  })
  it('empty template', () => {
    expect(renderCaption('', base).text).toBe('')
  })
  it('missing name → empty string', () => {
    const r = renderCaption('hello {name}', { ...base, name: '' as unknown as string })
    expect(r.text).toBe('hello')
  })
  it('trims result', () => {
    expect(renderCaption('  {id}  ', base).text).toBe('1234')
  })
})
