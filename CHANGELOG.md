# @trieb.work/payload-audit

## 1.2.0

### Minor Changes

- a0c3205: Add RFC 8693-style delegation support and custom action types to the
  audit log.
  - New `extraActions` plugin option lets projects define custom audit actions
    (e.g. `impersonation.started`) with optional labels. They are merged into
    the `action` select options and accepted by `writeAuditLog`.
  - New `delegation` plugin option enables delegation-aware audit logging. It is
    enabled by default and adds `onBehalfOf`, `onBehalfOfEmail`,
    `onBehalfOfName`, `delegationChain`, and `delegationChainDropped` fields to
    the audit collection.
  - `resolveDelegation()` reads `req.user._delegatedBy` (e.g. populated from a
    JWT `act` claim). When present, the delegator is recorded as `actor` and
    `req.user` becomes the `onBehalfOf` subject.
  - Nested delegation chains are flattened up to `maxChainDepth` (default `10`);
    deeper levels are counted in `delegationChainDropped`.
  - `writeAuditLog` accepts an explicit `onBehalfOf` override for lifecycle
    events that need to record delegation without a delegated request object.

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

- dac754e: Add opt-in forensic metadata to audit entries to aid breach
  investigation, especially stolen-token scenarios. New `forensics` config
  section captures request-derived security signals alongside each entry:
  - `authStrategy` (default `true`): records which auth strategy authenticated
    the request, e.g. `local-jwt`, `local-api-key`, `cookie`, or a custom
    strategy name from `req.user._strategy`.
  - `requestMethod` (default `true`): the HTTP method of the originating request
    (`POST`, `GET`, …).
  - `requestPath` (default `false`): the request URL path with the query string
    stripped. Opt-in because paths may contain sensitive data.
  - `tokenFingerprint` (default `false`): a non-reversible fingerprint of the
    auth token, formatted as `<prefix8>:<sha256(token)>`. Extracted from the
    `Authorization: Bearer <token>` and `Payload-API-Key` headers. The first 8
    characters let an operator recognise which of their tokens it was, while the
    SHA-256 hash enables correlation of every action performed with the same
    token. The raw token is never stored.

  All fields are conditionally added to the collection schema (like the existing
  `multiTenant` pattern), so existing installations keep their schema unchanged
  until they opt in. `authStrategy` and `requestMethod` default to `true`
  because they carry no sensitive data; `requestPath` and `tokenFingerprint`
  default to `false` and require explicit opt-in.

  Usage:

  ```ts
  auditLogPlugin({
    forensics: {
      authStrategy: true, // default
      requestMethod: true, // default
      requestPath: false, // opt-in (PII risk in paths)
      tokenFingerprint: true, // opt-in
    },
  })
  ```

### Patch Changes

- 7ff3122: Sign changesets release commits via the GitHub API instead of the git
  CLI so they satisfy branch protection's required commit signature check. This
  is a CI-only change with no effect on the published package.

## 1.1.0

### Minor Changes

- 6d6ac69: Implement core audit logging: an immutable `audit-logs` collection
  and `afterChange` / `afterDelete` hooks that are injected automatically across
  all collections (except those listed in `disabledCollections` and the audit
  collection itself). Each entry records the action, collection, document id and
  title, the acting user, and the request IP address and user agent when
  available. Upload-enabled collections record `file_upload` / `file_delete`
  actions. The collection is read-only through the API — entries are written
  internally so the trail cannot be tampered with.
- 7aee2a9: Initial release of the Payload CMS audit logging plugin. Records an
  immutable audit trail of create, update, and delete operations across all
  collections automatically, with an opt-out list, actor / IP address /
  user-agent capture, configurable retention (by count and/or age), and optional
  multi-tenant scoping. Built to support NIS-2, CRA, GDPR, SEC Cyber Disclosure,
  HIPAA, PCI-DSS 4.0, ISO/IEC 27001, and SOC 2 logging requirements.
- e19622d: Add optional multi-tenant support. When `multiTenant.enabled` is set,
  the audit log collection gains a `tenant` relationship and each entry records
  the tenant of the audited document, so the trail can be scoped per tenant. The
  tenant field name and tenants collection slug are configurable (defaults
  `tenant` / `tenants`). Designed to interoperate with
  `@payloadcms/plugin-multi-tenant`: that plugin adds the tenant field to your
  collections and this plugin reads it; register the audit collection with the
  multi-tenant plugin to enforce tenant-scoped read access in the admin UI.
- 049222c: Add configurable retention with a scheduled prune task. The
  `retention` option removes audit entries by age (`maxAge` in days) and/or by
  count (`maxEntries`, keeping the newest). When a limit is set, the plugin
  registers a `prune-audit-logs` Payload task with a daily cron schedule
  (configurable via `retention.cron` / `retention.queue`, or `disableSchedule`
  to run it manually). The standalone `pruneAuditLogs` function is also exported
  for programmatic use. Payload's internal collections (`payload-jobs`,
  `payload-locked-documents`, `payload-preferences`, `payload-migrations`,
  `payload-kv`) are now always excluded from auditing.

### Patch Changes

- 3bcba49: Add the test suite: Vitest unit tests for the request-metadata,
  document-title and tenant helpers; Vitest integration tests (against an
  in-memory MongoDB) for hook injection, create/update/delete logging,
  IP/user-agent capture, disabled-collection skipping, upload
  `file_upload`/`file_delete` actions, multi-tenant capture, trail immutability,
  and age/count retention pruning; and Playwright end-to-end tests driving the
  admin UI to confirm logging, disabled-collection behaviour, and the read-only
  collection.
