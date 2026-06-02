---
'@trieb.work/payload-audit': patch
---

Add the test suite: Vitest unit tests for the request-metadata, document-title
and tenant helpers; Vitest integration tests (against an in-memory MongoDB) for
hook injection, create/update/delete logging, IP/user-agent capture,
disabled-collection skipping, upload `file_upload`/`file_delete` actions,
multi-tenant capture, trail immutability, and age/count retention pruning; and
Playwright end-to-end tests driving the admin UI to confirm logging,
disabled-collection behaviour, and the read-only collection.
