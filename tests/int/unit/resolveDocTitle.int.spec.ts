import { describe, expect, it } from 'vitest'

import { resolveDocTitle } from '../../../src/utils/resolveDocTitle'

describe('resolveDocTitle', () => {
  it('uses the useAsTitle field when it holds a non-empty string', () => {
    expect(resolveDocTitle({ name: 'Acme' }, '1', 'name')).toBe('Acme')
  })

  it('stringifies a numeric useAsTitle value', () => {
    expect(resolveDocTitle({ year: 2026 }, '1', 'year')).toBe('2026')
  })

  it('falls back to the id when the title field is empty or missing', () => {
    expect(resolveDocTitle({ name: '   ' }, '42', 'name')).toBe('42')
    expect(resolveDocTitle({}, '42', 'name')).toBe('42')
    expect(resolveDocTitle({ name: 'x' }, 7)).toBe('7')
  })

  it('returns undefined when nothing is identifiable', () => {
    expect(resolveDocTitle(null, undefined, 'name')).toBeUndefined()
    expect(resolveDocTitle(undefined, undefined)).toBeUndefined()
  })
})
