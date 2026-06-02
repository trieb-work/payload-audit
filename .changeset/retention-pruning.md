---
'@trieb.work/payload-audit': minor
---

Add configurable retention with a scheduled prune task. The `retention` option
removes audit entries by age (`maxAge` in days) and/or by count (`maxEntries`,
keeping the newest). When a limit is set, the plugin registers a
`prune-audit-logs` Payload task with a daily cron schedule (configurable via
`retention.cron` / `retention.queue`, or `disableSchedule` to run it manually).
The standalone `pruneAuditLogs` function is also exported for programmatic use.
Payload's internal collections (`payload-jobs`, `payload-locked-documents`,
`payload-preferences`, `payload-migrations`, `payload-kv`) are now always
excluded from auditing.
