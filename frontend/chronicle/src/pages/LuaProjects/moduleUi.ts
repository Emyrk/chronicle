import type { LuaProjectKind } from "./api"

/** User-facing names for module kinds; the API and manifests keep "panel" and "guide". */
export const kindLabel = (kind: LuaProjectKind) => kind === "panel" ? "Instance panel" : "Guide"
/** A small dot colored by module kind, so lists stay scannable as more kinds are added. */
export const kindDot = (kind: LuaProjectKind) => kind === "panel" ? "bg-sky-400" : "bg-violet-400"
export const card = "rounded-xl border border-border/80 bg-card p-5 shadow-sm"
export const button = "inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
export const primaryButton = "inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
/** Boxes inside the welcome card: lighter than a card, so they do not read as boxes on boxes. */
export const welcomeBox = "h-fit min-w-0 rounded-lg border bg-background/60 p-5"
export const smallButton = "rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
export const badge = "inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-normal text-muted-foreground"

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again."
}
