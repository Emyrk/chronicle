export const SHOW_STRIP_TITLE_TOKEN = "show-title";

export function parseStripOptionTokens(option: string | null | undefined): string[] {
  return option?.split(",").map((token) => token.trim()).filter(Boolean) ?? [];
}

export function stripOptionEnabled(
  option: string | null | undefined,
  token: string,
): boolean {
  return parseStripOptionTokens(option).includes(token);
}

export function stripOptionValue(
  option: string | null | undefined,
  prefix: string,
): string | null {
  const token = parseStripOptionTokens(option).find((candidate) => candidate.startsWith(prefix));
  return token ? token.slice(prefix.length) : null;
}

export function updateStripOptionFlag(
  option: string | null | undefined,
  token: string,
  enabled: boolean,
): string | null {
  const tokens = parseStripOptionTokens(option).filter((candidate) => candidate !== token);
  if (enabled) tokens.push(token);
  return tokens.length > 0 ? tokens.join(",") : null;
}
