---
'@trieb.work/payload-audit': minor
---

Add opt-in forensic metadata to audit entries to aid breach investigation,
especially stolen-token scenarios. New `forensics` config section captures
request-derived security signals alongside each entry:

- `authStrategy` (default `true`): records which auth strategy authenticated
  the request, e.g. `local-jwt`, `local-api-key`, `cookie`, or a custom
  strategy name from `req.user._strategy`.
- `requestMethod` (default `true`): the HTTP method of the originating
  request (`POST`, `GET`, …).
- `requestPath` (default `false`): the request URL path with the query
  string stripped. Opt-in because paths may contain sensitive data.
- `tokenFingerprint` (default `false`): a non-reversible fingerprint of the
  auth token, formatted as `<prefix8>:<sha256(token)>`. Extracted from the
  `Authorization: Bearer <token>` and `Payload-API-Key` headers. The first 8
  characters let an operator recognise which of their tokens it was, while
  the SHA-256 hash enables correlation of every action performed with the
  same token. The raw token is never stored.

All fields are conditionally added to the collection schema (like the
existing `multiTenant` pattern), so existing installations keep their schema
unchanged until they opt in. `authStrategy` and `requestMethod` default to
`true` because they carry no sensitive data; `requestPath` and
`tokenFingerprint` default to `false` and require explicit opt-in.

Usage:

```ts
auditLogPlugin({
  forensics: {
    authStrategy: true,        // default
    requestMethod: true,       // default
    requestPath: false,        // opt-in (PII risk in paths)
    tokenFingerprint: true,    // opt-in
  },
})
```
