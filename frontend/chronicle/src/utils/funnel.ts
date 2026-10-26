// Landing funnel events for GA4 (docs/landing-funnel-events.md lists every name and param).
// gtag.js is loaded by index.html only when a GA4 ID is configured; otherwise these are no-ops.
import { campaignParams } from "./utm";

export type FunnelEvent = "land" | "hero_play_3s" | "scrub_or_bossjump" | "cta_sidekick" | "download_start";

/** Where a Get Sidekick / Download click on /start came from. */
export type CtaPlacement = "nav" | "hero" | "band" | "ghost_card";

/** Sends a funnel event, with the visitor's campaign utm_* params (from the URL, else the landing cookie). */
export function trackFunnel(event: FunnelEvent, params: Record<string, string> = {}): void {
  const campaign: Record<string, string> = {};
  campaignParams(window.location.search).forEach((value, key) => {
    campaign[key] = value;
  });
  window.gtag?.("event", event, { ...campaign, ...params });
}
