import { describe, expect, it } from 'vitest'

import { extractTenant } from '../../../src/utils/extractTenant'

describe('extractTenant', () => {
  it('reads a raw string or number id', () => {
    expect(extractTenant({ tenant: 'tenant-1' }, 'tenant')).toBe('tenant-1')
    expect(extractTenant({ tenant: 5 }, 'tenant')).toBe(5)
  })

  it('reads the id from a populated relationship object', () => {
    expect(extractTenant({ tenant: { id: 'tenant-2', name: 'Acme' } }, 'tenant')).toBe('tenant-2')
  })

  it('honours a custom tenant field name', () => {
    expect(extractTenant({ org: 'org-9' }, 'org')).toBe('org-9')
  })

  it('returns undefined when the tenant is missing or unusable', () => {
    expect(extractTenant({}, 'tenant')).toBeUndefined()
    expect(extractTenant(null, 'tenant')).toBeUndefined()
    expect(extractTenant({ tenant: {} }, 'tenant')).toBeUndefined()
  })
})
