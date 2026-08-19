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

  if (onBehalfOfOverride) {
    return {
      actor: null,
      chain: [],
      dropped: 0,
      onBehalfOf: onBehalfOfOverride,
    }
  }

  const user = req.user as AuditDelegationUser | null | undefined
  if (!user) {
    return { actor: null, chain: [], dropped: 0, onBehalfOf: null }
  }

  const delegator = user._delegatedBy
  if (!delegator) {
    return { actor: null, chain: [], dropped: 0, onBehalfOf: null }
  }

  const maxDepth = delegation?.maxChainDepth ?? DEFAULT_MAX_CHAIN_DEPTH

  return {
    actor: delegator,
    chain: buildActorChain(delegator, maxDepth),
    dropped: countActorChainDropped(delegator, maxDepth),
    onBehalfOf: user,
  }
}

/**
 * Builds a serialised chain of actors from the immediate delegator outward.
 * The first entry is the party that actually performed the request; each
 * subsequent entry delegated authority one level further away.
 */
function buildActorChain(
  actor: AuditDelegationUser,
  maxDepth: number,
): AuditDelegationChainEntry[] {
  const chain: AuditDelegationChainEntry[] = []
  let current: AuditDelegationUser | undefined = actor
  let depth = 0

  while (current && depth < maxDepth) {
    chain.push({
      id: current.id,
      name: current.name,
      collection: current.collection,
      email: current.email,
    })
    current = current._delegatedBy
    depth++
  }

  return chain
}

/**
 * Counts how many delegation levels were truncated because they exceeded
 * `maxChainDepth`. Keeps audit entries honest about incomplete chains.
 */
function countActorChainDropped(actor: AuditDelegationUser, maxDepth: number): number {
  let current: AuditDelegationUser | undefined = actor
  let depth = 0

  while (current) {
    if (depth >= maxDepth) {
      // Count this level and any deeper ones.
      let dropped = 0
      while (current) {
        dropped++
        current = current._delegatedBy
      }
      return dropped
    }
    current = current._delegatedBy
    depth++
  }

  return 0
}
