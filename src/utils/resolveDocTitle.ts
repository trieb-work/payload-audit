/**
 * Resolves a human-readable title for an audited document.
 *
 * Prefers the audited collection's `admin.useAsTitle` field when it holds a
 * usable scalar value, otherwise falls back to the document ID. Returns
 * `undefined` only when nothing identifiable is available (e.g. an afterDelete
 * hook that received no document snapshot).
 */
export function resolveDocTitle(
  doc: null | Record<string, unknown> | undefined,
  fallbackId: number | string | undefined,
  useAsTitle?: string,
): string | undefined {
  if (doc && useAsTitle) {
    const value = doc[useAsTitle]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
    if (typeof value === 'number') {
      return String(value)
    }
  }

  if (fallbackId != null) {
    return String(fallbackId)
  }

  return undefined
}
