export type StripTitleMode = "overlay" | "large" | "none";

export const STRIP_TITLE_MODE_PREFIX = "title-mode:";
const LEGACY_SHOW_STRIP_TITLE_TOKEN = "show-title";

export function parseStripOptionTokens(option: string | null | undefined): string[] {
  return option?.split(",").map((token) => token.trim()).filter(Boolean) ?? [];
}

export function stripOptionValue(
  option: string | null | undefined,
  prefix: string,
): string | null {
  const token = parseStripOptionTokens(option).find((candidate) => candidate.startsWith(prefix));
  return token ? token.slice(prefix.length) : null;
}

export function stripTitleMode(option: string | null | undefined): StripTitleMode {
  const value = stripOptionValue(option, STRIP_TITLE_MODE_PREFIX);
  if (value === "overlay" || value === "large" || value === "none") return value;
  // Preserve layouts saved by the original boolean title option.
  if (parseStripOptionTokens(option).includes(LEGACY_SHOW_STRIP_TITLE_TOKEN)) return "overlay";
  return "none";
}

export function updateStripTitleMode(
  option: string | null | undefined,
  mode: StripTitleMode,
): string | null {
  const tokens = parseStripOptionTokens(option).filter((token) =>
    token !== LEGACY_SHOW_STRIP_TITLE_TOKEN && !token.startsWith(STRIP_TITLE_MODE_PREFIX),
  );
  if (mode !== "none") tokens.push(`${STRIP_TITLE_MODE_PREFIX}${mode}`);
  return tokens.length > 0 ? tokens.join(",") : null;
}
