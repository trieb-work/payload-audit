import type { Payload, PayloadRequest, TaskConfig, Where } from 'payload'

/** Result of a single prune run. */
export interface PruneAuditLogsResult {
  /** Total entries removed (age + count). */
  deleted: number
  /** Entries removed for exceeding `maxAge`. */
  deletedByAge: number
  /** Entries removed for exceeding `maxEntries`. */
  deletedByCount: number
}

export interface PruneAuditLogsArgs {
  /** Slug of the audit log collection. */
  auditCollectionSlug: string
  /** Delete entries older than this many days. */
  maxAge?: number
  /** Keep at most this many entries. */
  maxEntries?: number
  /** Payload instance used to query and delete entries. */
  payload: Payload
  /** Optional request, forwarded so deletes join an existing transaction. */
  req?: PayloadRequest
}

/**
 * Loosely-typed view of the Payload methods used here. The plugin is generic
 * and must not couple to a host app's generated collection types.
 */
interface LoosePayload {
  count: (args: {
    collection: string
    overrideAccess?: boolean
    req?: PayloadRequest
    where?: Where
  }) => Promise<{ totalDocs: number }>
  delete: (args: {
    collection: string
    overrideAccess?: boolean
    req?: PayloadRequest
    where: Where
  }) => Promise<{ docs?: unknown[]; errors?: unknown[] }>
  find: (args: {
    collection: string
    depth?: number
    limit?: number
    overrideAccess?: boolean
    pagination?: boolean
    req?: PayloadRequest
    sort?: string
    where?: Where
  }) => Promise<{ docs: Array<{ id: number | string }> }>
}

/**
 * Removes audit log entries that violate the retention policy.
 *
 * Age-based pruning runs first (delete everything older than `maxAge` days),
 * then count-based pruning trims whatever remains down to the newest
 * `maxEntries`. Either limit may be omitted. All operations use
 * `overrideAccess` since the collection denies deletes through the API.
 */
export async function pruneAuditLogs(args: PruneAuditLogsArgs): Promise<PruneAuditLogsResult> {
  const { auditCollectionSlug, maxAge, maxEntries, req } = args
  const payload = args.payload as unknown as LoosePayload

  let deletedByAge = 0
  let deletedByCount = 0

  // 1) Age-based: delete entries older than the cutoff.
  if (typeof maxAge === 'number' && maxAge > 0) {
    const cutoff = new Date(Date.now() - maxAge * 24 * 60 * 60 * 1000).toISOString()
    const result = await payload.delete({
      collection: auditCollectionSlug,
      overrideAccess: true,
      req,
      where: { occurredAt: { less_than: cutoff } },
    })
    deletedByAge = result.docs?.length ?? 0
  }

  // 2) Count-based: keep only the newest `maxEntries`.
  if (typeof maxEntries === 'number' && maxEntries >= 0) {
    const { totalDocs } = await payload.count({
      collection: auditCollectionSlug,
      overrideAccess: true,
      req,
    })

    const excess = totalDocs - maxEntries
    if (excess > 0) {
      // Oldest-first, limited to the surplus, IDs only.
      const oldest = await payload.find({
        collection: auditCollectionSlug,
        depth: 0,
        limit: excess,
        overrideAccess: true,
        pagination: false,
        req,
        sort: 'occurredAt',
      })

      const ids = oldest.docs.map((doc) => doc.id)
      if (ids.length > 0) {
        const result = await payload.delete({
          collection: auditCollectionSlug,
          overrideAccess: true,
          req,
          where: { id: { in: ids } },
        })
        deletedByCount = result.docs?.length ?? ids.length
      }
    }
  }

  return {
    deleted: deletedByAge + deletedByCount,
    deletedByAge,
    deletedByCount,
  }
}

export interface CreatePruneAuditLogsTaskArgs {
  /** Slug of the audit log collection. */
  auditCollectionSlug: string
  /** Cron schedule. Default: `0 0 * * *`. */
  cron?: string
  /** Register the task without a schedule. Default: `false`. */
  disableSchedule?: boolean
  /** Delete entries older than this many days. */
  maxAge?: number
  /** Keep at most this many entries. */
  maxEntries?: number
  /** Queue to schedule on. Default: `default`. */
  queue?: string
}

/** Slug of the generated prune task. */
export const PRUNE_AUDIT_LOGS_TASK_SLUG = 'prune-audit-logs'

/**
 * Input/output shape for the prune task. The plugin is generic, so the task is
 * not registered in the host app's `TypedJobs`; supplying the shape explicitly
 * keeps the handler's `output` strongly typed instead of `never`.
 */
type PruneTaskIO = { input: Record<string, unknown>; output: PruneAuditLogsResult }

/**
 * Builds the Payload task that enforces the retention policy on a schedule.
 *
 * The handler delegates to {@link pruneAuditLogs}. A schedule is attached unless
 * `disableSchedule` is set; note that scheduled jobs only run when the host app
 * has the jobs runner enabled (e.g. `jobs.autoRun` self-hosted, or an external
 * cron hitting the run endpoint on serverless).
 */
export function createPruneAuditLogsTask(
  args: CreatePruneAuditLogsTaskArgs,
): TaskConfig<PruneTaskIO> {
  const {
    auditCollectionSlug,
    cron = '0 0 * * *',
    disableSchedule = false,
    maxAge,
    maxEntries,
    queue = 'default',
  } = args

  const task: TaskConfig<PruneTaskIO> = {
    slug: PRUNE_AUDIT_LOGS_TASK_SLUG,
    handler: async ({ req }) => {
      const result = await pruneAuditLogs({
        auditCollectionSlug,
        maxAge,
        maxEntries,
        payload: req.payload,
        req,
      })
      req.payload.logger.info(
        { deleted: result.deleted, deletedByAge: result.deletedByAge, deletedByCount: result.deletedByCount },
        '[payload-audit] Pruned audit logs',
      )
      return { output: result }
    },
    label: 'Prune audit logs',
    outputSchema: [
      { name: 'deleted', type: 'number' },
      { name: 'deletedByAge', type: 'number' },
      { name: 'deletedByCount', type: 'number' },
    ],
  }

  if (!disableSchedule) {
    task.schedule = [{ cron, queue }]
  }

  return task
}
