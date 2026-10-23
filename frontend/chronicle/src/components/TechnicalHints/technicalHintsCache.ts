import type { TechnicalHint, TechnicalHintKind, TechnicalHintsResponse } from "./types";

const TECHNICAL_HINTS_CACHE_KEY = "chronicle-technical-hints-v1";
export const TECHNICAL_HINTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface StoredTechnicalHints {
  response: TechnicalHintsResponse;
  cachedAt: number;
}

const TECHNICAL_HINT_KINDS = new Set<TechnicalHintKind>([
  "tip",
  "panel",
  "blog",
  "community_fact",
]);

function getBrowserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isTechnicalHint(value: unknown): value is TechnicalHint {
  if (!value || typeof value !== "object") return false;
  const hint = value as Record<string, unknown>;

  return (
    typeof hint.id === "string" &&
    hint.id.length > 0 &&
    typeof hint.kind === "string" &&
    TECHNICAL_HINT_KINDS.has(hint.kind as TechnicalHintKind) &&
    typeof hint.title === "string" &&
    hint.title.length > 0 &&
    typeof hint.body === "string" &&
    hint.body.length > 0 &&
    isOptionalString(hint.href) &&
    isOptionalString(hint.action_label) &&
    isOptionalString(hint.icon) &&
    isOptionalString(hint.image_url) &&
    isOptionalString(hint.panel) &&
    isOptionalString(hint.blog_id) &&
    isOptionalString(hint.generated_at) &&
    isOptionalString(hint.expires_at) &&
    (hint.tags === undefined || (Array.isArray(hint.tags) && hint.tags.every((tag) => typeof tag === "string")))
  );
}

export function isTechnicalHintsResponse(value: unknown): value is TechnicalHintsResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;

  return (
    typeof response.version === "string" &&
    response.version.length > 0 &&
    typeof response.generated_at === "string" &&
    typeof response.refresh_after === "string" &&
    Array.isArray(response.payloads) &&
    response.payloads.every(isTechnicalHint)
  );
}

export function filterUnexpiredTechnicalHints(
  response: TechnicalHintsResponse,
  now = Date.now(),
): TechnicalHintsResponse {
  return {
    ...response,
    payloads: response.payloads.filter((hint) => {
      if (!hint.expires_at) return true;
      const expiresAt = Date.parse(hint.expires_at);
      return Number.isFinite(expiresAt) && expiresAt > now;
    }),
  };
}

export function readCachedTechnicalHints(
  storage: Storage | undefined = getBrowserStorage(),
  now = Date.now(),
): TechnicalHintsResponse | undefined {
  if (!storage) return undefined;

  try {
    const raw = storage.getItem(TECHNICAL_HINTS_CACHE_KEY);
    if (!raw) return undefined;

    const stored = JSON.parse(raw) as Partial<StoredTechnicalHints>;
    if (
      typeof stored.cachedAt !== "number" ||
      !Number.isFinite(stored.cachedAt) ||
      stored.cachedAt > now ||
      now - stored.cachedAt >= TECHNICAL_HINTS_CACHE_TTL_MS ||
      !isTechnicalHintsResponse(stored.response)
    ) {
      storage.removeItem(TECHNICAL_HINTS_CACHE_KEY);
      return undefined;
    }

    return filterUnexpiredTechnicalHints(stored.response, now);
  } catch {
    try {
      storage.removeItem(TECHNICAL_HINTS_CACHE_KEY);
    } catch {
      // Storage may become unavailable between reads.
    }
    return undefined;
  }
}

export function writeCachedTechnicalHints(
  response: TechnicalHintsResponse,
  storage: Storage | undefined = getBrowserStorage(),
  now = Date.now(),
): void {
  if (!storage || !isTechnicalHintsResponse(response)) return;

  try {
    storage.setItem(
      TECHNICAL_HINTS_CACHE_KEY,
      JSON.stringify({ response, cachedAt: now } satisfies StoredTechnicalHints),
    );
  } catch {
    // The React Query cache remains available when storage is blocked or full.
  }
}
