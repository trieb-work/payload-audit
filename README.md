# @trieb.work/payload-audit

> Automatic, compliance-ready audit logging for
> [Payload CMS](https://payloadcms.com).

A Payload CMS v3 plugin that records an immutable audit trail of create, update,
and delete activity across **all** of your collections — automatically, with no
per-collection wiring. Each entry captures who did what, to which document, and
from where (IP address and user agent), so you can answer "who changed this, and
when?" long after the fact.

It is built to help satisfy the logging and accountability requirements of
**NIS-2, the Cyber Resilience Act (CRA), GDPR, the SEC Cyber Disclosure Rules,
HIPAA, PCI-DSS 4.0, ISO/IEC 27001, and SOC 2**.

## Features

- **Works automatically on every collection** — opt collections out with
  `disabledCollections`; Payload's internal collections are always excluded.
- **Rich entries** — action, collection, document id and title, the acting user,
  and the request IP address and user agent when available.
- **Immutable** — the audit collection is read-only through the API; entries are
  written internally and can never be edited or deleted by users.
- **Configurable retention** — prune by age and/or by count via a scheduled
  task, or call the prune function yourself.
- **Optional multi-tenant scoping** — record the tenant of each audited
  document; interoperates with `@payloadcms/plugin-multi-tenant`.
- **Type-safe and framework-native** — a standard Payload plugin; no patching.

## Installation

```bash
pnpm add @trieb.work/payload-audit
# or: npm install / yarn add
```

Peer dependencies: `payload@^3`, `next@^15`, `react@^19`, and
`@payloadcms/db-mongodb@^3` (the plugin targets the MongoDB adapter).

## Quick start

```ts
import { buildConfig } from 'payload'
import { auditLogPlugin } from '@trieb.work/payload-audit'

export default buildConfig({
  // ...your config
  plugins: [auditLogPlugin()],
})
```

That's it. An `audit-logs` collection appears in the admin (under a **System**
group), and every create/update/delete across your collections is recorded.

## Configuration

```ts
auditLogPlugin({
  enabled: true,
  collectionSlug: 'audit-logs',
  disabledCollections: ['sessions'],
  access: {
    read: ({ req }) => req.user?.role === 'admin',
  },
  retention: {
    maxAge: 365, // days
    maxEntries: 100_000,
  },
  multiTenant: {
    enabled: true,
  },
})
```

| Option                              | Type       | Default       | Description                                                                   |
| ----------------------------------- | ---------- | ------------- | ----------------------------------------------------------------------------- |
| `enabled`                           | `boolean`  | `true`        | Master switch. When `false`, the plugin is a no-op.                           |
| `collectionSlug`                    | `string`   | `audit-logs`  | Slug of the generated audit log collection.                                   |
| `disabledCollections`               | `string[]` | `[]`          | Collection slugs to exclude from auditing.                                    |
| `access.read`                       | `Access`   | authenticated | Read access for the audit collection. Create/update/delete are always denied. |
| `retention.maxAge`                  | `number`   | —             | Delete entries older than this many days.                                     |
| `retention.maxEntries`              | `number`   | —             | Keep at most this many entries (newest kept).                                 |
| `retention.cron`                    | `string`   | `0 0 * * *`   | Cron schedule for the prune task.                                             |
| `retention.queue`                   | `string`   | `default`     | Queue the prune task is scheduled on.                                         |
| `retention.disableSchedule`         | `boolean`  | `false`       | Register the prune task without a schedule (run it manually).                 |
| `multiTenant.enabled`               | `boolean`  | `false`       | Add a tenant relationship and record each entry's tenant.                     |
| `multiTenant.tenantFieldName`       | `string`   | `tenant`      | Tenant field name on audited docs and on the audit collection.                |
| `multiTenant.tenantsCollectionSlug` | `string`   | `tenants`     | Tenants collection slug for the relationship.                                 |

## What gets recorded

Each entry in the `audit-logs` collection has:

| Field              | Description                                                            |
| ------------------ | ---------------------------------------------------------------------- |
| `occurredAt`       | Timestamp of the action.                                               |
| `action`           | `create`, `update`, `delete`, `file_upload`, `file_delete`.            |
| `entityCollection` | Slug of the audited collection.                                        |
| `docId`            | Id of the audited document.                                            |
| `docTitle`         | Human-readable label (from the collection's `useAsTitle`).             |
| `actor`            | The authenticated user who performed the action, if any.               |
| `ipAddress`        | Client IP (from `x-forwarded-for` / `x-real-ip` / `cf-connecting-ip`). |
| `userAgent`        | Client user agent, when available.                                     |
| `tenant`           | The audited document's tenant (multi-tenant mode only).                |

On **upload-enabled** collections, a create is recorded as `file_upload` and a
delete as `file_delete`, so file lifecycle events are distinguishable from
ordinary document changes.

## Retention & pruning

When `retention.maxAge` and/or `retention.maxEntries` is set, the plugin
registers a `prune-audit-logs` Payload task that deletes entries violating the
policy (age first, then count). It is scheduled daily by default.

Scheduled tasks only run when your app's jobs runner is active:

- **Self-hosted / long-running:** enable Payload's
  [`jobs.autoRun`](https://payloadcms.com/docs/jobs-queue/jobs).
- **Serverless (e.g. Vercel):** trigger the jobs run endpoint from an external
  cron.

You can also prune programmatically at any time:

```ts
import { pruneAuditLogs } from '@trieb.work/payload-audit'

await pruneAuditLogs({
  payload,
  auditCollectionSlug: 'audit-logs',
  maxAge: 365,
  maxEntries: 100_000,
})
```

## Multi-tenant

Enable `multiTenant` to add a `tenant` relationship to the audit collection and
record the tenant of each audited document:

```ts
auditLogPlugin({ multiTenant: { enabled: true } })
```

This is designed to interoperate with
[`@payloadcms/plugin-multi-tenant`](https://payloadcms.com/docs/plugins/multi-tenant):
that plugin adds the tenant field (default `tenant`) to your collections, and
this plugin reads it. To enforce tenant-scoped **read access** in the admin UI,
also register the audit collection with the multi-tenant plugin.

## Immutability & security

The audit collection denies `create`, `update`, and `delete` for everyone.
Entries are written only by the plugin's internal hooks using `overrideAccess`,
and the write joins the same transaction as the operation that triggered it — so
the trail stays consistent with the change it records and cannot be tampered
with through the API or the admin UI.

## Compliance coverage

Audit logging is a recurring control across modern security and privacy regimes.
This plugin provides the tamper-evident, actor-attributed, timestamped activity
record those frameworks expect:

| Framework         | How this plugin helps                                                   |
| ----------------- | ----------------------------------------------------------------------- |
| **NIS-2**         | Logging and traceability of changes to in-scope systems.                |
| **CRA**           | Records supporting incident handling and accountability.                |
| **GDPR**          | Accountability (Art. 5(2)) and records of processing on personal data.  |
| **SEC Cyber**     | Evidence trail supporting timely incident assessment and disclosure.    |
| **HIPAA**         | Audit controls for access to and modification of records (§164.312(b)). |
| **PCI-DSS 4.0**   | Logging of changes and access (Requirement 10).                         |
| **ISO/IEC 27001** | Event logging control (A.8.15) and accountability.                      |
| **SOC 2**         | Monitoring and change-tracking evidence for the trust criteria.         |

> This plugin is a building block, not a complete compliance solution. Pair it
> with appropriate retention, access control, and operational procedures.

## Programmatic API

```ts
import {
  auditLogPlugin,
  writeAuditLog,
  pruneAuditLogs,
  extractRequestMeta,
  extractTenant,
  resolveDocTitle,
  buildAuditLogsCollection,
  createPruneAuditLogsTask,
  DEFAULT_AUDIT_COLLECTION_SLUG,
} from '@trieb.work/payload-audit'
```

Type exports include `AuditLogPluginConfig`, `AuditAction`,
`AuditRetentionConfig`, `AuditMultiTenantConfig`, and more.

## Development

```bash
pnpm install
pnpm dev          # dev Payload app (zero-config, in-memory Mongo) at /admin
pnpm test:int     # Vitest unit + integration tests
pnpm test:e2e     # Playwright end-to-end tests
pnpm build        # build the publishable plugin
```

The dev admin seeds a user `dev@payload-audit.local` / `test`.

## License

[MIT](./LICENSE) © trieb.work
