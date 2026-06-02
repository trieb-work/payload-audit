import type { Access, CollectionConfig, CollectionSlug, Field } from 'payload'

import type { AuditAccessConfig } from '../types'

/** Default read access: any authenticated user may read the audit trail. */
const defaultReadAccess: Access = ({ req }) => Boolean(req.user)

/** Writes are always denied — the trail is immutable and written internally. */
const denyAccess: Access = () => false

export interface BuildAuditLogsCollectionArgs {
  /** Read access override. */
  access?: AuditAccessConfig
  /** Auth-enabled collection slugs, used to shape the `actor` relationship. */
  authCollectionSlugs: string[]
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
  const { slug, access, authCollectionSlugs, multiTenant } = args

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

  return {
    slug,
    access: {
      create: denyAccess,
      delete: denyAccess,
      read: access?.read ?? defaultReadAccess,
      update: denyAccess,
    },
    admin: {
      defaultColumns: ['occurredAt', 'action', 'entityCollection', 'docTitle', 'actor'],
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
