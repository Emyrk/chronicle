// Landing funnel events for GA4. gtag.js is loaded by index.html only when a GA4 ID is configured;
// otherwise these are no-ops. GA4 attributes them to the session's utm_* campaign from the landing URL.

export type FunnelEvent = "land" | "hero_play_3s" | "scrub_or_bossjump" | "cta_sidekick" | "explore_3d_open" | "explore_3d_full_run" | "meter_drill";

/** Where the Explore in 3D modal was opened from on /start. */
export type ExplorePlacement = "hero" | "hero_chip" | "recent" | "koth";

/** Which glass meter a bar click drilled into: the hero's, the phone strip under it, or the Explore modal's. */
export type MeterDrillPlacement = "hero" | "strip" | "explore";

/** Sends a funnel event. */
export function trackFunnel(event: FunnelEvent, params: Record<string, string> = {}): void {
  window.gtag?.("event", event, params);
}
