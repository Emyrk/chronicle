export const LAYOUT_TITLE_PATTERN = /^[A-Za-z0-9_\-\s]+$/;
export const LAYOUT_TITLE_ERROR = "Title can only contain letters, numbers, spaces, hyphens, and underscores";
export const DEFAULT_LAYOUT_ICON = "INV_Misc_Book_09";

/** True when `title` is empty or uses only characters the API accepts. */
export function isValidLayoutTitle(title: string): boolean {
  const trimmed = title.trim();
  return !trimmed || LAYOUT_TITLE_PATTERN.test(trimmed);
}
