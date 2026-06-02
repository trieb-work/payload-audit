---
'@trieb.work/payload-audit': minor
---

Add optional multi-tenant support. When `multiTenant.enabled` is set, the audit
log collection gains a `tenant` relationship and each entry records the tenant
of the audited document, so the trail can be scoped per tenant. The tenant field
name and tenants collection slug are configurable (defaults `tenant` /
`tenants`). Designed to interoperate with `@payloadcms/plugin-multi-tenant`:
that plugin adds the tenant field to your collections and this plugin reads it;
register the audit collection with the multi-tenant plugin to enforce
tenant-scoped read access in the admin UI.
