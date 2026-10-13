export function extractOpenDeathRecaps(panelOption: string | null | undefined): Set<string> {
  const token = panelOption?.split(",").find((part) => part.trim().startsWith("o:"));
  if (!token) return new Set();
  const keys = new Set<string>();
  for (const encoded of token.slice(2).split("~").filter(Boolean)) {
    try {
      keys.add(decodeURIComponent(encoded));
    } catch {
      // Ignore malformed remote/shared option tokens instead of throwing during render.
    }
  }
  return keys;
}

export function updateOpenDeathRecaps(
  panelOption: string | null | undefined,
  keys: Iterable<string>,
): string {
  const tokens = (panelOption ?? "")
    .split(",")
    .filter((part) => part.trim() && !part.trim().startsWith("o:"));
  const encoded = Array.from(keys, (key) => encodeURIComponent(key));
  if (encoded.length > 0) tokens.push(`o:${encoded.join("~")}`);
  return tokens.join(",");
}
