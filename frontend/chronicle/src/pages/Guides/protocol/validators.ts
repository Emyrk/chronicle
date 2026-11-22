/** Validation primitives shared by scene operations and widget specs. Errors never echo raw values. */
export const MAX_STRING_LENGTH = 4_096
export const MAX_ID_LENGTH = 128
const COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

export class SceneValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SceneValidationError"
  }
}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new SceneValidationError(`${label} must be an object`)
  return value as Record<string, unknown>
}

export function exact(value: Record<string, unknown>, fields: readonly string[], label: string) {
  for (const key of Object.keys(value)) if (!fields.includes(key)) throw new SceneValidationError(`${label} has unknown property ${key}`)
}

export function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new SceneValidationError(`${label} must be a finite number`)
  return value
}

export function bounded(value: unknown, min: number, max: number, label: string): number {
  const result = finite(value, label)
  if (result < min || result > max) throw new SceneValidationError(`${label} must be between ${min} and ${max}`)
  return result
}

export function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

export function string(value: unknown, label: string, max = MAX_STRING_LENGTH): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max || hasControlCharacters(value)) {
    throw new SceneValidationError(`${label} must be a non-empty safe string of at most ${max} characters`)
  }
  return value
}

/** Display text may be empty (SetText("") clears a label) and may contain newlines and tabs. */
export function displayText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > MAX_STRING_LENGTH || hasControlCharacters(value.replace(/[\n\t]/g, ""))) {
    throw new SceneValidationError(`${label} must be text of at most ${MAX_STRING_LENGTH} characters without control characters other than newlines and tabs`)
  }
  return value
}

export function id(value: unknown, label = "id"): string { return string(value, label, MAX_ID_LENGTH) }

export function color(value: unknown, label: string): string {
  if (typeof value !== "string" || !COLOR.test(value)) throw new SceneValidationError(`${label} must be a hex color`)
  return value
}

export function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new SceneValidationError(`${label} must be a boolean`)
  return value
}

export const MAX_LINK_LENGTH = 512
/** A path on this site, such as "/modules/author/slug". Never a URL, protocol-relative path or script. "" removes the link. */
const SITE_PATH = /^\/(?![/\\])[A-Za-z0-9\-._~!$&'()*+,;=:@/?#%]*$/
export function sitePath(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > MAX_LINK_LENGTH || (value !== "" && !SITE_PATH.test(value))) {
    throw new SceneValidationError(`${label} must be a path on this site starting with /, such as /modules/author/slug`)
  }
  return value
}
