import type { Access, CollectionConfig, CollectionSlug, Field } from 'payload'

import type { AuditAccessConfig, AuditDelegationConfig, AuditExtraAction } from '../types'

/** Default read access: any authenticated user may read the audit trail. */
const defaultReadAccess: Access = ({ req }) => Boolean(req.user)

/** Writes are always denied — the trail is immutable and written internally. */
const denyAccess: Access = () => false

export interface BuildAuditLogsCollectionArgs {
  /** Read access override. */
  access?: AuditAccessConfig
  /** Auth-enabled collection slugs, used to shape the `actor` relationship. */
  authCollectionSlugs: string[]
  /**
   * Delegation configuration. When `enabled` is not `false`, the collection
   * gains `onBehalfOf` and `delegationChain` fields to record RFC 8693-style
   * delegation chains.
   */
  delegation?: AuditDelegationConfig
  /**
   * Custom action types beyond the built-in lifecycle events. Merged into the
   * `action` select options.
   */
  extraActions?: Array<AuditExtraAction | string>
  /**
   * Forensic capture flags. When a flag is `true` the corresponding field is
   * added to the collection schema. All default to `false` so existing
   * installations do not gain new fields.
   */
  forensics?: {
    authStrategy: boolean
    requestMethod: boolean
    requestPath: boolean
    tokenFingerprint: boolean
  }
  /** When set, adds a tenant relationship field for multi-tenant scoping. */
  multiTenant?: {
    tenantFieldName: string
    tenantsCollectionSlug: string
  }
  /** Slug for the generated collection. */
  slug: string
}

/**
 * Builds the immutable `audit-logs` collection.
 *
 * The collection is read-only through the API: create, update, and delete are
 * denied for all users so entries can only be written internally via
 * {@link writeAuditLog} (which uses `overrideAccess`). Read access defaults to
 * any authenticated user and can be tightened via the plugin's `access.read`.
 */
export function buildAuditLogsCollection(args: BuildAuditLogsCollectionArgs): CollectionConfig {
  const { slug, access, authCollectionSlugs, delegation, extraActions, forensics, multiTenant } =
    args

  const builtInActionValues = new Set(['create', 'delete', 'file_delete', 'file_upload', 'update'])
  const seenActionValues = new Set(builtInActionValues)
  const extraActionOptions = (extraActions ?? [])
    .map((action) =>
      typeof action === 'string' ?
        { label: action, value: action }
      : { label: action.label ?? action.value, value: action.value },
    )
    .filter((option) => {
      if (seenActionValues.has(option.value)) {
        return false
      }
      seenActionValues.add(option.value)
      return true
    })

  const fields: Field[] = [
    {
      name: 'occurredAt',
      type: 'date',
      admin: {
        date: { displayFormat: 'yyyy-MM-dd HH:mm:ss', pickerAppearance: 'dayAndTime' },
      },
      defaultValue: () => new Date().toISOString(),
      index: true,
      label: 'Occurred at',
      required: true,
    },
    {
      name: 'action',
      type: 'select',
      index: true,
      options: [
        { label: 'Create', value: 'create' },
        { label: 'Update', value: 'update' },
        { label: 'Delete', value: 'delete' },
        { label: 'File upload', value: 'file_upload' },
        { label: 'File delete', value: 'file_delete' },
        ...extraActionOptions,
      ],
      required: true,
    },
    {
      name: 'entityCollection',
      type: 'text',
      admin: { description: 'Slug of the collection the audited document belongs to.' },
      index: true,
      label: 'Collection',
      required: true,
    },
    {
      name: 'docId',
      type: 'text',
      index: true,
      label: 'Document ID',
      required: true,
    },
    {
      name: 'docTitle',
      type: 'text',
      label: 'Document title',
    },
  ]

  // Only add the actor relationship when there is at least one auth collection
  // to point at. Single auth collection -> plain relationship; multiple ->
  // polymorphic relationship.
  if (authCollectionSlugs.length > 0) {
    // The plugin is generic, so auth slugs are plain strings at author time.
    // The relationship Field type is a discriminated union on `relationTo`
    // (single vs polymorphic), so the assembled field is cast to `Field`.
    const actorField = {
      name: 'actor',
      type: 'relationship',
      admin: { description: 'The authenticated user who performed the action, if any.' },
      index: true,
      relationTo:
        authCollectionSlugs.length === 1 ?
          (authCollectionSlugs[0] as CollectionSlug)
        : (authCollectionSlugs as CollectionSlug[]),
    } as Field
    fields.push(actorField)
  }

  // Denormalised actor snapshot — survives deletion of the user document.
  fields.push(
    {
      name: 'actorEmail',
      type: 'text',
      admin: { description: "Snapshot of the actor's email at the time of the action." },
      label: 'Actor email',
    },
    {
      name: 'actorName',
      type: 'text',
      admin: { description: "Snapshot of the actor's display name at the time of the action." },
      label: 'Actor name',
    },
  )

  // Delegation-aware fields — record the user on whose behalf the action was
  // performed (RFC 8693 `act` semantics) and, when available, the full chain
  // of nested delegations.
  if (delegation?.enabled !== false) {
    if (authCollectionSlugs.length > 0) {
      const onBehalfOfField = {
        name: 'onBehalfOf',
        type: 'relationship',
        admin: { description: 'The user on whose behalf the action was performed, if any.' },
        index: true,
        relationTo:
          authCollectionSlugs.length === 1 ?
            (authCollectionSlugs[0] as CollectionSlug)
          : (authCollectionSlugs as CollectionSlug[]),
      } as Field
      fields.push(onBehalfOfField)
    }

    fields.push(
      {
        name: 'onBehalfOfEmail',
        type: 'text',
        admin: { description: "Snapshot of the delegated user's email at the time of the action." },
        label: 'On behalf of email',
      },
      {
        name: 'onBehalfOfName',
        type: 'text',
        admin: {
          description: "Snapshot of the delegated user's display name at the time of the action.",
        },
        label: 'On behalf of name',
      },
      {
        name: 'delegationChain',
        type: 'json',
        admin: {
          description:
            'Serialised RFC 8693-style delegation chain (innermost actor first). Empty when no delegation occurred.',
        },
        label: 'Delegation chain',
      },
      {
        name: 'delegationChainDropped',
        type: 'number',
        admin: {
          description: 'Number of delegation levels truncated because they exceeded maxChainDepth.',
        },
        defaultValue: 0,
        label: 'Delegation chain dropped',
      },
    )
  }

  // Multi-tenant: add the tenant relationship so entries can be scoped per
  // tenant (and so the multi-tenant plugin can constrain access if registered).
  if (multiTenant) {
    const tenantField = {
      name: multiTenant.tenantFieldName,
      type: 'relationship',
      admin: { description: 'Tenant the audited document belongs to.' },
      index: true,
      relationTo: multiTenant.tenantsCollectionSlug as CollectionSlug,
    } as Field
    fields.push(tenantField)

    // Denormalised tenant snapshot — survives deletion of the tenant document.
    const tenantIdField = {
      name: 'tenantId',
      type: 'text',
      admin: { description: "Snapshot of the tenant's id at the time of the action." },
      index: true,
      label: 'Tenant ID',
    } as Field
    fields.push(tenantIdField)

    const tenantNameField = {
      name: 'tenantName',
      type: 'text',
      admin: { description: "Snapshot of the tenant's name at the time of the action." },
      label: 'Tenant name',
    } as Field
    fields.push(tenantNameField)
  }

  fields.push(
    {
      name: 'ipAddress',
      type: 'text',
      admin: { description: 'Client IP address, when available.' },
      label: 'IP address',
    },
    {
      name: 'userAgent',
      type: 'text',
      admin: { description: 'Client user agent, when available.' },
      label: 'User agent',
    },
  )

  // Forensic metadata — each field is added only when its flag is enabled, so
  // existing installations keep their schema unchanged until they opt in.
  if (forensics?.authStrategy) {
    fields.push({
      name: 'authStrategy',
      type: 'text',
      admin: {
        description:
          'Auth strategy that authenticated the request (e.g. local-jwt, local-api-key, cookie).',
      },
      index: true,
      label: 'Auth strategy',
    })
  }

  if (forensics?.requestMethod) {
    fields.push({
      name: 'requestMethod',
      type: 'text',
      admin: { description: 'HTTP method of the originating request.' },
      label: 'Request method',
    })
  }

  if (forensics?.requestPath) {
    fields.push({
      name: 'requestPath',
      type: 'text',
      admin: { description: 'Request URL path (query string stripped).' },
      label: 'Request path',
    })
  }

  if (forensics?.tokenFingerprint) {
    fields.push({
      name: 'tokenFingerprint',
      type: 'text',
      admin: {
        description:
          'Non-reversible fingerprint of the auth token: <prefix8>:<sha256(token)>. Used to correlate actions performed with the same token without storing the token itself.',
      },
      index: true,
      label: 'Token fingerprint',
    })
  }

  return {
    slug,
    access: {
      create: denyAccess,
      delete: denyAccess,
      read: access?.read ?? defaultReadAccess,
      update: denyAccess,
    },
    admin: {
      defaultColumns: [
        'occurredAt',
        'action',
        'entityCollection',
        'docTitle',
        ...(authCollectionSlugs.length > 0 ? ['actor'] : []),
        ...(delegation?.enabled !== false && authCollectionSlugs.length > 0 ? ['onBehalfOf'] : []),
        ...(forensics?.authStrategy ? ['authStrategy'] : []),
        ...(forensics?.tokenFingerprint ? ['tokenFingerprint'] : []),
      ],
      description: 'Immutable record of create, update, and delete activity across collections.',
      group: 'System',
      useAsTitle: 'docTitle',
    },
    fields,
    labels: {
      plural: 'Audit Logs',
      singular: 'Audit Log',
    },
  }
}
