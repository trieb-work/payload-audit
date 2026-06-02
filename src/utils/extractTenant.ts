/**
 * Reads the tenant id from an audited document.
 *
 * The multi-tenant field may hold a plain id (string/number) or a populated
 * relationship object (`{ id }`), depending on the request's `depth`. Returns
 * `undefined` when no tenant is present.
 */
export function extractTenant(
  doc: null | Record<string, unknown> | undefined,
  tenantFieldName: string,
): number | string | undefined {
  if (!doc) {
    return undefined
  }

  const value = doc[tenantFieldName]

  if (typeof value === 'string' || typeof value === 'number') {
    return value
  }

  if (value && typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'string' || typeof id === 'number') {
      return id
    }
  }

  return undefined
}

/**
 * Reads the tenant display name from an audited document when the tenant field
 * is a populated relationship object. Best-effort: returns `undefined` when
 * the field is absent, unpopulated, or has no `name` property.
 */
export function extractTenantName(
  doc: null | Record<string, unknown> | undefined,
  tenantFieldName: string,
): string | undefined {
  if (!doc) {
    return undefined
  }

  const value = doc[tenantFieldName]

  if (value && typeof value === 'object') {
    const name = (value as { name?: unknown }).name
    if (typeof name === 'string' && name.trim().length > 0) {
      return name
    }
  }

  return undefined
}
