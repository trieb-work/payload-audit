import { describe, expect, it } from 'vitest'

import type { AuditDelegationUser, PayloadRequest } from '../../../src/types'

import { resolveDelegation } from '../../../src/utils/resolveDelegation'

const reqWithUser = (user?: AuditDelegationUser): PayloadRequest =>
  ({ user }) as unknown as PayloadRequest

describe('resolveDelegation', () => {
  it('returns null actor/onBehalfOf when no delegation is present', () => {
    const req = reqWithUser({ id: 'user-1', name: 'User', email: 'user@example.com' })
    const result = resolveDelegation(req)

    expect(result.actor).toBeNull()
    expect(result.onBehalfOf).toBeNull()
    expect(result.chain).toEqual([])
    expect(result.dropped).toBe(0)
  })

  it('returns null actor/onBehalfOf when the request has no user', () => {
    const result = resolveDelegation(reqWithUser())

    expect(result.actor).toBeNull()
    expect(result.onBehalfOf).toBeNull()
    expect(result.chain).toEqual([])
  })

  it('resolves a single-level delegation', () => {
    const delegator: AuditDelegationUser = {
      id: 'admin-1',
      name: 'Admin',
      email: 'admin@example.com',
    }
    const req = reqWithUser({
      id: 'user-1',
      name: 'User',
      _delegatedBy: delegator,
      email: 'user@example.com',
    })

    const result = resolveDelegation(req)

    expect(result.actor).toEqual(delegator)
    expect(result.onBehalfOf).toMatchObject({
      id: 'user-1',
      name: 'User',
      email: 'user@example.com',
    })
    expect(result.chain).toEqual([{ id: 'admin-1', name: 'Admin', email: 'admin@example.com' }])
    expect(result.dropped).toBe(0)
  })

  it('resolves a nested delegation chain from the immediate actor outward', () => {
    const req = reqWithUser({
      id: 'user-1',
      name: 'User',
      _delegatedBy: {
        id: 'agent-1',
        name: 'Agent',
        _delegatedBy: {
          id: 'admin-1',
          name: 'Admin',
          email: 'admin@example.com',
        },
        email: 'agent@example.com',
      },
      email: 'user@example.com',
    })

    const result = resolveDelegation(req)

    expect(result.actor).toMatchObject({ id: 'agent-1' })
    expect(result.onBehalfOf).toMatchObject({ id: 'user-1' })
    expect(result.chain).toEqual([
      { id: 'agent-1', name: 'Agent', email: 'agent@example.com' },
      { id: 'admin-1', name: 'Admin', email: 'admin@example.com' },
    ])
    expect(result.dropped).toBe(0)
  })

  it('truncates chains deeper than maxChainDepth and reports dropped count', () => {
    const req = reqWithUser({
      id: 'user-1',
      _delegatedBy: {
        id: 'actor-1',
        _delegatedBy: {
          id: 'actor-2',
          _delegatedBy: {
            id: 'actor-3',
          },
        },
      },
    })

    const result = resolveDelegation(req, { maxChainDepth: 2 })

    expect(result.chain).toHaveLength(2)
    expect(result.chain[0]).toMatchObject({ id: 'actor-1' })
    expect(result.chain[1]).toMatchObject({ id: 'actor-2' })
    expect(result.dropped).toBe(1)
  })

  it('returns the explicit onBehalfOf override when provided', () => {
    const req = reqWithUser({ id: 'requester-1' })
    const override: AuditDelegationUser = { id: 'override-1', email: 'override@example.com' }

    const result = resolveDelegation(req, {}, override)

    expect(result.actor).toBeNull()
    expect(result.onBehalfOf).toEqual(override)
    expect(result.chain).toEqual([])
    expect(result.dropped).toBe(0)
  })

  it('ignores delegation when explicitly disabled', () => {
    const req = reqWithUser({
      id: 'user-1',
      _delegatedBy: { id: 'admin-1' },
    })

    const result = resolveDelegation(req, { enabled: false })

    expect(result.actor).toBeNull()
    expect(result.onBehalfOf).toBeNull()
    expect(result.chain).toEqual([])
    expect(result.dropped).toBe(0)
  })

  it('preserves the explicit override even when delegation is disabled', () => {
    const req = reqWithUser({ id: 'user-1' })
    const override: AuditDelegationUser = { id: 'override-1' }

    const result = resolveDelegation(req, { enabled: false }, override)

    expect(result.onBehalfOf).toEqual(override)
    expect(result.actor).toBeNull()
  })

  it('preserves the collection field for polymorphic auth setups', () => {
    const req = reqWithUser({
      id: 'user-1',
      _delegatedBy: {
        id: 'admin-1',
        collection: 'users',
      },
      collection: 'customers',
    })

    const result = resolveDelegation(req)

    expect(result.actor).toMatchObject({ id: 'admin-1', collection: 'users' })
    expect(result.onBehalfOf).toMatchObject({ id: 'user-1', collection: 'customers' })
    expect(result.chain[0]).toMatchObject({ id: 'admin-1', collection: 'users' })
  })

  it('BUG 1: preserves actor and chain when onBehalfOf override is provided alongside _delegatedBy', () => {
    const delegator: AuditDelegationUser = {
      id: 'admin-1',
      name: 'Admin',
      email: 'admin@example.com',
    }
    const req = reqWithUser({
      id: 'user-1',
      name: 'User',
      _delegatedBy: delegator,
      email: 'user@example.com',
    })
    const override: AuditDelegationUser = { id: 'override-1', email: 'override@example.com' }

    const result = resolveDelegation(req, {}, override)

    expect(result.actor).toMatchObject({ id: 'admin-1' })
    expect(result.chain).toEqual([{ id: 'admin-1', name: 'Admin', email: 'admin@example.com' }])
    expect(result.onBehalfOf).toEqual(override)
  })

  it('BUG 3: does not infinite-loop on a circular delegation chain', () => {
    const circularA: AuditDelegationUser = { id: 'a-1' }
    const circularB: AuditDelegationUser = { id: 'b-1', _delegatedBy: circularA }
    circularA._delegatedBy = circularB

    const req = reqWithUser({
      id: 'user-1',
      _delegatedBy: circularA,
    })

    const result = resolveDelegation(req, { maxChainDepth: 5 })

    expect(result.chain.length).toBeLessThanOrEqual(5)
    expect(result.dropped).toBeGreaterThanOrEqual(0)
  })
})
