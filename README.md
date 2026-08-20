# @trieb.work/payload-audit

[![npm version](https://img.shields.io/npm/v/@trieb.work/payload-audit.svg)](https://www.npmjs.com/package/@trieb.work/payload-audit)
[![CI](https://github.com/trieb-work/payload-audit/actions/workflows/ci.yml/badge.svg)](https://github.com/trieb-work/payload-audit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Payload CMS](https://img.shields.io/badge/Payload-3.x-000000)](https://payloadcms.com)

> Automatic, compliance-ready **audit logging** and **audit trail** plugin for
> [Payload CMS](https://payloadcms.com). Zero-config change tracking with
> delegation, forensics, retention, and multi-tenancy built in.

Manually wiring up audit logs for every collection is tedious and easy to get
wrong — one forgotten hook and your audit trail has a gap. **payload-audit**
attaches itself to every collection in your Payload config automatically and
writes an immutable log entry for every create, update, and delete, so you get a
complete, tamper-proof activity trail with a single line of configuration.

It's built to help satisfy the logging and accountability requirements of
**NIS-2, CRA, GDPR, SEC Cyber Disclosure Rules, HIPAA, PCI-DSS 4.0, ISO/IEC
27001, and SOC 2** — but it's just as useful as a general-purpose "who changed
what, when" activity log for any Payload project.

## Features

- **Zero-config coverage** — hooks into every collection automatically, with an
  opt-out list (`disabledCollections`). No per-collection setup.
- **Immutable audit trail** — the generated `audit-logs` collection denies
  create/update/delete through the API; entries can only be written internally
  by the plugin, so the log can't be altered or deleted by users.
- **Rich context per entry** — actor (with email/name snapshot that survives
  user deletion), document id and title, IP address, and user agent.
- **File tracking** — upload-enabled collections get dedicated `file_upload` /
  `file_delete` actions.
- **Delegation & impersonation aware** (RFC 8693 `act` semantics) — records who
  performed an action _on behalf of_ whom, including nested delegation chains
  (User → Agent → Service), via `onBehalfOf` and `delegationChain`.
- **Forensic metadata** for breach investigation — optionally capture auth
  strategy, HTTP method, request path, and a non-reversible token fingerprint
  (`sha256`) to correlate every action performed with a stolen credential,
  without ever storing the raw token.
- **Custom actions** — extend the built-in action types with your own
  (`extraActions`), e.g. `impersonation.started`, for manually emitted entries.
- **Configurable retention** — prune entries by age (`maxAge`), by count
  (`maxEntries`), or both, via a scheduled Payload job (custom cron/queue
  supported, or trigger manually).
- **Multi-tenant scoping** — optional `tenant` relationship on every entry, with
  auto-detection and out-of-the-box interop with
  `@payloadcms/plugin-multi-tenant`.
- **Configurable read access** — lock down who can view the audit trail via a
  standard Payload `access.read` function.
- **Programmatic API** — `writeAuditLog`, `resolveDelegation`, `extractTenant`,
  `resolveDocTitle`, and `pruneAuditLogs` are all exported for custom hooks and
  scripts. A `skipAuditLog` request-context flag lets you suppress logging for a
  single operation when you emit a more specific entry yourself.

## Quick start

```bash
pnpm add @trieb.work/payload-audit
```

```ts
// payload.config.ts
import { auditLogPlugin } from '@trieb.work/payload-audit'

export default buildConfig({
  // ...
  plugins: [
    auditLogPlugin({
      disabledCollections: ['sessions'],
      retention: { maxAge: 365 }, // keep one year of history
    }),
  ],
})
```

That's it — every collection now writes to an `audit-logs` collection
automatically. Open the admin UI to see the trail.

## Configuration

All options are optional; sensible, safe defaults are used when omitted.

```ts
auditLogPlugin({
  // Master switch. `false` turns the plugin into a no-op.
  enabled: true,

  // Slug of the generated audit collection. Default: 'audit-logs'.
  collectionSlug: 'audit-logs',

  // Collections that should never be audited (in addition to the audit
  // collection itself and Payload's internal collections).
  disabledCollections: ['sessions'],

  // Read access for the audit trail. Default: any authenticated user.
  access: { read: ({ req }) => req.user?.role === 'admin' },

  // Prune old entries by age and/or count via a scheduled job.
  retention: { maxAge: 365, maxEntries: 100_000, cron: '0 0 * * *' },

  // Scope entries per tenant. Interoperates with @payloadcms/plugin-multi-tenant.
  multiTenant: { enabled: true, autoDetect: true },

  // Opt-in forensic metadata for breach investigation.
  forensics: {
    authStrategy: true,
    requestMethod: true,
    tokenFingerprint: true,
  },

  // RFC 8693 delegation/impersonation-aware logging. Enabled by default.
  delegation: { enabled: true, maxChainDepth: 10 },

  // Custom action types beyond create/update/delete/file_upload/file_delete.
  extraActions: [
    { value: 'impersonation.started', label: 'Impersonation started' },
  ],
})
```

See the exported TypeScript types (`AuditLogPluginConfig` and friends) for the
full reference and inline documentation.

## Compliance mapping

| Requirement                                                  | Covered by                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| Who changed what, when (GDPR Art. 30, SOC 2 CC7)             | Automatic actor/action/timestamp capture on every collection |
| Tamper-proof records (ISO 27001 A.8.15, PCI-DSS 4.0 10.3)    | Immutable collection, API writes always denied               |
| Incident detection & forensics (NIS-2, SEC Cyber Disclosure) | Forensics metadata, token fingerprinting, delegation chains  |
| Data retention limits (GDPR storage limitation)              | Configurable `retention` (age/count) with scheduled pruning  |
| Access accountability across tenants (HIPAA, SOC 2)          | Multi-tenant scoping of the audit trail                      |

This is a starting point, not legal advice — always validate against your own
compliance obligations.

## Development

```bash
pnpm install
pnpm dev          # start the dev Payload app (zero-config, in-memory Mongo)
pnpm build        # build the publishable plugin
```

### Testing

The test suite is split into three layers:

- **Unit tests** (`pnpm test:int`) — Fast, isolated tests for helpers
  (`extractRequestMeta`, `resolveDocTitle`, `extractTenant`) and plugin config
  wiring. Uses Vitest with `vite-tsconfig-paths`.

- **Integration tests** (`pnpm test:int`) — Same Vitest run, but tests live
  against a real Payload instance (via `getPayload` with the dev config and
  `mongodb-memory-server`). Covers create/update/delete logging, upload
  tracking, multi-tenant scoping, retention pruning, and immutability.

- **E2E tests** (`pnpm test:e2e`) — Playwright tests against the running admin
  UI. Requires a **built dev app** first:
  ```bash
  pnpm build:dev   # or start the dev server manually
  pnpm test:e2e
  ```

Run everything:

```bash
pnpm test          # test:int + test:e2e
```

## Contributing

Issues and pull requests are welcome — see the
[GitHub repository](https://github.com/trieb-work/payload-audit).

## License

[MIT](./LICENSE) © trieb.work
