# @trieb.work/payload-audit

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
