export const LAYOUT_TITLE_PATTERN = /^[A-Za-z0-9_\-\s]+$/;
export const LAYOUT_TITLE_ERROR = "Title can only contain letters, numbers, spaces, hyphens, and underscores";
export const DEFAULT_LAYOUT_ICON = "INV_Misc_Book_09";

/** True when `title` is empty or uses only characters the API accepts. */
export function isValidLayoutTitle(title: string): boolean {
  const trimmed = title.trim();
  return !trimmed || LAYOUT_TITLE_PATTERN.test(trimmed);
}

interface TitledLayout {
  id: string;
  title: string;
}

function normalizeTitle(title: string): string {
  // Mirrors the database's unique (user_id, lower(title)) index; the drawer trims before saving.
  return title.trim().toLowerCase();
}

/**
 * The user's own layout already using `title`, ignoring case, if any.
 * `exceptId` skips the layout being overwritten, which may keep its title.
 */
export function findLayoutTitleConflict<T extends TitledLayout>(
  title: string,
  ownLayouts: readonly T[],
  exceptId?: string,
): T | undefined {
  const normalized = normalizeTitle(title);
  if (!normalized) return undefined;
  return ownLayouts.find((layout) => layout.id !== exceptId && normalizeTitle(layout.title) === normalized);
}

/** `base`, or `base 2`, `base 3`, … — the first that none of the user's own layouts use. */
export function uniqueLayoutTitle(base: string, ownLayouts: readonly TitledLayout[]): string {
  if (!findLayoutTitleConflict(base, ownLayouts)) return base;
  for (let suffix = 2; ; suffix++) {
    const candidate = `${base} ${suffix}`;
    if (!findLayoutTitleConflict(candidate, ownLayouts)) return candidate;
  }
}
