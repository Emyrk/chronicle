const PUBLIC_NOTICE_CACHE_KEY = "chronicle-public-notice-cache";
export const PUBLIC_NOTICE_EMPTY_TTL_MS = 60 * 60 * 1000;

type PublicNoticeCache = {
  hasNotices: boolean;
  checkedAt: number;
};

function readCache(storage: Storage): PublicNoticeCache | null {
  try {
    const raw = storage.getItem(PUBLIC_NOTICE_CACHE_KEY);
    if (!raw) return null;

    const value = JSON.parse(raw) as Partial<PublicNoticeCache>;
    if (
      typeof value.hasNotices !== "boolean" ||
      typeof value.checkedAt !== "number" ||
      !Number.isFinite(value.checkedAt)
    ) {
      return null;
    }
    return {
      hasNotices: value.hasNotices,
      checkedAt: value.checkedAt as number,
    };
  } catch {
    return null;
  }
}

export function shouldFetchPublicNotices(
  storage: Storage = localStorage,
  now = Date.now(),
): boolean {
  const cached = readCache(storage);
  if (!cached || cached.hasNotices) return true;
  return now - cached.checkedAt >= PUBLIC_NOTICE_EMPTY_TTL_MS;
}

export function recordPublicNoticeResult(
  hasNotices: boolean,
  storage: Storage = localStorage,
  now = Date.now(),
): void {
  try {
    storage.setItem(
      PUBLIC_NOTICE_CACHE_KEY,
      JSON.stringify({ hasNotices, checkedAt: now } satisfies PublicNoticeCache),
    );
  } catch {
    // Storage can be unavailable in privacy modes. The notice request still works.
  }
}
