const instanceIdentifierPattern = /^[A-Za-z0-9_-]+$/

/** Chronicle instance UUIDs and generated slugs are both URL-safe identifiers. */
export function isInstanceIdentifier(value: string): boolean {
  const identifier = value.trim()
  return identifier.length > 0 && instanceIdentifierPattern.test(identifier)
}
