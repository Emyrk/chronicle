import type { ReactNode } from "react";

/** One choice in a combobox. Only value is required; label defaults to it. */
export interface ComboOption {
  value: string;
  label?: string;
  /** Muted text after the label, e.g. "10 bosses". */
  hint?: string;
  icon?: ReactNode;
  /** Options with the same group are listed together under a header. */
  group?: string;
  /** Extra text that typing can match but that isn't shown (e.g. a description). */
  keywords?: string;
}

/** Plain strings are shorthand for { value }. */
export type Suggestion = string | ComboOption;

export function toOptions(suggestions: readonly Suggestion[]): ComboOption[] {
  return suggestions.map((s) => (typeof s === "string" ? { value: s } : s));
}

/**
 * Options matching typed text, case-insensitively, in label, value or hint.
 * Text that exactly names an option shows the whole list again, so reopening
 * a filled box still lets you pick something else.
 */
export function filterOptions(options: readonly ComboOption[], text: string, exclude: readonly string[] = []): ComboOption[] {
  const q = text.trim().toLowerCase();
  const skip = new Set(exclude.map((v) => v.toLowerCase()));
  const pool = options.filter((o) => !skip.has(o.value.toLowerCase()));
  if (!q || pool.some((o) => o.value.toLowerCase() === q)) return pool;
  return pool.filter((o) => [o.label ?? o.value, o.value, o.hint ?? "", o.keywords ?? ""].some((s) => s.toLowerCase().includes(q)));
}
