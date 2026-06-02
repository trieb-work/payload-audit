---
'@trieb.work/payload-audit': minor
---

Implement core audit logging: an immutable `audit-logs` collection and
`afterChange` / `afterDelete` hooks that are injected automatically across all
collections (except those listed in `disabledCollections` and the audit
collection itself). Each entry records the action, collection, document id and
title, the acting user, and the request IP address and user agent when
available. Upload-enabled collections record `file_upload` / `file_delete`
actions. The collection is read-only through the API — entries are written
internally so the trail cannot be tampered with.
