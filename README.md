# @trieb.work/payload-audit

> Automatic, compliance-ready audit logging for
> [Payload CMS](https://payloadcms.com).

A Payload CMS plugin that records an immutable audit trail of create, update,
and delete operations across **all** collections automatically. Built to help
satisfy the logging and accountability requirements of **NIS-2, CRA, GDPR, SEC
Cyber Disclosure Rules, HIPAA, PCI-DSS 4.0, ISO/IEC 27001, and SOC 2**.

> **Status:** Under active development. Full documentation, configuration
> reference, and compliance mapping will be published with the first release.

## Planned features

- Works automatically on every collection, with an opt-out list
  (`disabledCollections`).
- Captures actor, IP address, and user agent (when available).
- Configurable retention — by maximum number of entries and/or by age.
- Immutable log collection (writes only through the plugin, never the API).
- Optional multi-tenant scoping.

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

## License

[MIT](./LICENSE) © trieb.work
