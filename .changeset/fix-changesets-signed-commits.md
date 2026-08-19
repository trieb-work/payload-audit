---
'@trieb.work/payload-audit': patch
---

Sign changesets release commits via the GitHub API instead of the git CLI so
they satisfy branch protection's required commit signature check. This is a
CI-only change with no effect on the published package.
