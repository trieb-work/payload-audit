import { describe, expect, it } from 'vitest'

import { auditLogPlugin } from '../../src/index'

/**
 * Phase 1 scaffolding smoke test. Confirms the plugin factory is wired up and
 * behaves as a Payload `Plugin` (a function that transforms a config). Replaced
 * by full integration coverage in Phase 4.
 */
describe('auditLogPlugin (scaffold)', () => {
  it('returns a plugin function', () => {
    const plugin = auditLogPlugin()
    expect(typeof plugin).toBe('function')
  })

  it('is a no-op passthrough when enabled is false', () => {
    const plugin = auditLogPlugin({ enabled: false })
    const config = { collections: [] } as any
    expect(plugin(config)).toBe(config)
  })

  it('returns a config object when enabled', () => {
    const plugin = auditLogPlugin()
    const config = { collections: [] } as any
    const result = plugin(config)
    expect(result).toBeDefined()
    expect(result).toHaveProperty('collections')
  })
})
