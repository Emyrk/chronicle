const HIDE_UNTIL_KEY = "support-banner-hide-until";

function parseHideUntil(value: string | null | undefined): number {
  const hideUntil = Number(value ?? 0);
  return Number.isFinite(hideUntil) && hideUntil > 0 ? hideUntil : 0;
}

export function readHideUntilCookie(cookieHeader: string): number {
  const prefix = `${HIDE_UNTIL_KEY}=`;
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(prefix))
    .reduce((latest, part) => Math.max(latest, parseHideUntil(part.slice(prefix.length))), 0);
}

export function buildHideUntilCookie(hideUntil: number, primaryDomain?: string, secure = false): string {
  const attributes = [
    `${HIDE_UNTIL_KEY}=${hideUntil}`,
    "Path=/",
    `Expires=${new Date(hideUntil).toUTCString()}`,
    "SameSite=Lax",
  ];

  if (primaryDomain) {
    attributes.push(`Domain=${primaryDomain}`);
  }
  if (secure) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

/** Reads both stores so existing localStorage dismissals keep working. */
export function readSupportBannerHideUntil(): number {
  return Math.max(
    readHideUntilCookie(document.cookie),
    parseHideUntil(localStorage.getItem(HIDE_UNTIL_KEY)),
  );
}

/** Copies an existing host-only dismissal into the cross-subdomain cookie. */
export function migrateSupportBannerHideUntil(primaryDomain?: string): void {
  if (!primaryDomain) {
    return;
  }

  const cookieHideUntil = readHideUntilCookie(document.cookie);
  const localHideUntil = parseHideUntil(localStorage.getItem(HIDE_UNTIL_KEY));
  if (localHideUntil > cookieHideUntil) {
    document.cookie = buildHideUntilCookie(localHideUntil, primaryDomain, window.location.protocol === "https:");
  }
}

export function writeSupportBannerHideUntil(hideUntil: number, primaryDomain?: string): void {
  // Keep localStorage as a fallback for deployments without a primary domain
  // and for browsers that reject parent-domain cookies.
  localStorage.setItem(HIDE_UNTIL_KEY, String(hideUntil));
  document.cookie = buildHideUntilCookie(hideUntil, primaryDomain, window.location.protocol === "https:");
}
