# @trieb.work/payload-audit

> Automatic, compliance-ready audit logging for [Payload CMS](https://payloadcms.com).

A Payload CMS plugin that records an immutable audit trail of create, update, and
delete operations across **all** collections automatically. Built to help satisfy
the logging and accountability requirements of **NIS-2, CRA, GDPR, SEC Cyber
Disclosure Rules, HIPAA, PCI-DSS 4.0, ISO/IEC 27001, and SOC 2**.

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
pnpm test:int     # run integration tests (Vitest)
pnpm test:e2e     # run end-to-end tests (Playwright)
pnpm build        # build the publishable plugin
```

## License

[MIT](./LICENSE) © trieb.work
