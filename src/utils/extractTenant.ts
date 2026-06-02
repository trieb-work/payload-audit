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
