import type { IncomingEventsWindow } from "../IncomingEvents/IncomingEventsBreakout";

export function normalizeDeathWindow(window: IncomingEventsWindow): IncomingEventsWindow {
  if (window === "all") return window;
  return Math.max(5, Math.min(120, Math.round(window)));
}

export function extractDeathWindow(panelOption: string | null | undefined): IncomingEventsWindow {
  const token = panelOption?.split(",").map((value) => value.trim()).find((value) => value.startsWith("w:"));
  const value = token?.slice(2);
  if (value === "all") return "all";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? normalizeDeathWindow(parsed) : 30;
}

export function updateDeathWindow(
  panelOption: string | null | undefined,
  window: IncomingEventsWindow,
): string {
  const existing = (panelOption ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token && !token.startsWith("w:"));
  existing.push(`w:${normalizeDeathWindow(window)}`);
  return existing.join(",");
}
