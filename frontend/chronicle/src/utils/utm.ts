// Campaign (utm_*) passthrough for the landing → /download → pairing funnel.
// The params are kept in a first-party cookie so they survive the hop from the
// ad landing to /download and into the Sidekick pairing page, which the server
// reads (internal/services/serviceoauth: utmCookie).
const COOKIE = "chronicle_utm";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function utmOnly(params: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  params.forEach((value, key) => {
    if (key.startsWith("utm_") && value !== "") out.set(key, value);
  });
  return out;
}

function readCookie(): URLSearchParams {
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!raw) return new URLSearchParams();
  try {
    return utmOnly(new URLSearchParams(decodeURIComponent(raw)));
  } catch {
    return new URLSearchParams();
  }
}

/** Stores the utm_* params of `search`, if any, replacing an older campaign. */
export function captureUtm(search: string): void {
  const utm = utmOnly(new URLSearchParams(search));
  if (utm.size === 0) return;
  document.cookie = `${COOKIE}=${encodeURIComponent(utm.toString())}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
}

/** The current campaign: utm_* params on `search`, else the stored ones. */
export function campaignParams(search: string): URLSearchParams {
  const utm = utmOnly(new URLSearchParams(search));
  return utm.size > 0 ? utm : readCookie();
}

/** Appends the campaign params to `href`, keeping any query it already has. */
export function withCampaign(href: string, campaign: URLSearchParams): string {
  if (campaign.size === 0) return href;
  const url = new URL(href, "http://relative.invalid");
  campaign.forEach((value, key) => url.searchParams.set(key, value));
  return href.startsWith("/") ? `${url.pathname}${url.search}${url.hash}` : url.toString();
}
