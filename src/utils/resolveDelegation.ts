import type {
  AuditDelegationChainEntry,
  AuditDelegationConfig,
  AuditDelegationUser,
  PayloadRequest,
} from '../types'

/**
 * Result of resolving the delegator (actor) and the delegated subject for an
 * audit log entry. `actor` is the party that actually performed the request;
 * `onBehalfOf` is the party in whose name the action was taken.
 */
export interface ResolvedDelegation {
  /**
   * The delegator / actor. When delegation is present this comes from
   * `req.user._delegatedBy`; otherwise it is `null` and the caller should fall
   * back to the direct request user as the actor.
   */
  actor: AuditDelegationUser | null
  /**
   * Serialized delegation chain for the audit entry. Contains the immediate
   * actor first, followed by each successive delegator further away from the
   * request. Empty when no delegation information is available.
   */
  chain: AuditDelegationChainEntry[]
  /** Number of chain levels dropped because they exceeded `maxChainDepth`. */
  dropped: number
  /**
   * The user on whose behalf the action was performed. When an explicit
   * override is supplied it takes precedence; otherwise it is inferred from the
   * request user when `_delegatedBy` is present.
   */
  onBehalfOf: AuditDelegationUser | null
}

const DEFAULT_MAX_CHAIN_DEPTH = 10

/**
 * Resolves delegation information from a Payload request.
 *
 * The host application is responsible for setting `req.user._delegatedBy`
 * (e.g. parsed from an RFC 8693 `act` claim). The plugin remains generic and
 * does not know how the host authenticates or mints tokens.
 *
 * When `_delegatedBy` is present, the actor becomes the delegator and the
 * request user becomes the `onBehalfOf` subject. Nested `_delegatedBy` values
 * are flattened into `chain` up to `maxChainDepth`; deeper levels are counted
 * in `dropped` but not persisted.
 */
export function resolveDelegation(
  req: PayloadRequest,
  delegation?: AuditDelegationConfig,
  onBehalfOfOverride?: AuditDelegationUser,
): ResolvedDelegation {
  if (delegation?.enabled === false) {
    return { actor: null, chain: [], dropped: 0, onBehalfOf: onBehalfOfOverride ?? null }
  }

  const user = req.user as AuditDelegationUser | null | undefined
  if (!user) {
    return { actor: null, chain: [], dropped: 0, onBehalfOf: onBehalfOfOverride ?? null }
  }

  const delegator = user._delegatedBy
  if (!delegator) {
    return { actor: null, chain: [], dropped: 0, onBehalfOf: onBehalfOfOverride ?? null }
  }

  const maxDepth = delegation?.maxChainDepth ?? DEFAULT_MAX_CHAIN_DEPTH
  const { chain, dropped } = buildActorChain(delegator, maxDepth)

  return {
    actor: delegator,
    chain,
    dropped,
    onBehalfOf: onBehalfOfOverride ?? user,
  }
}

/**
 * Builds a serialised chain of actors from the immediate delegator outward.
 * The first entry is the party that actually performed the request; each
 * subsequent entry delegated authority one level further away.
 *
 * Uses a WeakSet to detect cycles and prevent infinite loops on malformed
 * delegation data.
 */
function buildActorChain(
  actor: AuditDelegationUser,
  maxDepth: number,
): { chain: AuditDelegationChainEntry[]; dropped: number } {
  const chain: AuditDelegationChainEntry[] = []
  const seen = new WeakSet<object>()
  let current: AuditDelegationUser | undefined = actor
  let depth = 0

  while (current && depth < maxDepth) {
    if (seen.has(current)) {
      // Cycle detected — stop to avoid an infinite loop. The already captured
      // entries represent the usable chain.
      return { chain, dropped: 0 }
    }

    seen.add(current)
    chain.push({
      id: current.id,
      name: current.name,
      collection: current.collection,
      email: current.email,
    })
    current = current._delegatedBy
    depth++
  }

  // Count any remaining levels (beyond maxDepth or until a cycle) as dropped.
  let dropped = 0
  while (current) {
    if (seen.has(current)) {
      break
    }
    seen.add(current)
    dropped++
    current = current._delegatedBy
  }

  return { chain, dropped }
}
