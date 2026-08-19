---
'@trieb.work/payload-audit': minor
---

Add RFC 8693-style delegation support and custom action types to the audit log.

- New `extraActions` plugin option lets projects define custom audit actions
  (e.g. `impersonation.started`) with optional labels. They are merged into the
  `action` select options and accepted by `writeAuditLog`.
- New `delegation` plugin option enables delegation-aware audit logging. It is
  enabled by default and adds `onBehalfOf`, `onBehalfOfEmail`, `onBehalfOfName`,
  `delegationChain`, and `delegationChainDropped` fields to the audit
  collection.
- `resolveDelegation()` reads `req.user._delegatedBy` (e.g. populated from a JWT
  `act` claim). When present, the delegator is recorded as `actor` and
  `req.user` becomes the `onBehalfOf` subject.
- Nested delegation chains are flattened up to `maxChainDepth` (default `10`);
  deeper levels are counted in `delegationChainDropped`.
- `writeAuditLog` accepts an explicit `onBehalfOf` override for lifecycle events
  that need to record delegation without a delegated request object.

Usage:

```ts
auditLogPlugin({
  extraActions: [
    { value: 'impersonation.started', label: 'Impersonation started' },
    { value: 'impersonation.ended', label: 'Impersonation ended' },
  ],
  delegation: {
    enabled: true, // default
    maxChainDepth: 10, // default
  },
})
```
