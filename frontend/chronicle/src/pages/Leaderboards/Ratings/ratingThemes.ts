import { Crown, Flame, LayoutGrid, ShieldCheck, type LucideIcon } from "lucide-react"
import { CLASS_DISPLAY } from "@/pages/Rankings/classDisplay"
import { RATING_METRICS, scopeKind, type RatingMetric, type RatingScope } from "./ratingBoards.fixtures"

export type RatingView = "overview" | RatingMetric

export interface MetricTheme {
  label: string
  icon: LucideIcon
  /** Accent used sparingly so the active metric is recognizable at a glance. */
  accent: string
  tagline: string
  format: (score: number) => string
}

export const METRIC_THEMES: Record<RatingView, MetricTheme> = {
  overview: {
    label: "Overview",
    icon: LayoutGrid,
    accent: "#d4d6dc",
    tagline: "Peak, Ranked Mastery, and Renown side by side.",
    format: (v) => v.toFixed(1),
  },
  peak: {
    label: "Peak",
    icon: Flame,
    accent: "#e2b25a",
    tagline: "One best kill, scored against the spec record.",
    format: (v) => v.toFixed(1),
  },
  mastery: {
    label: "Ranked Mastery",
    icon: ShieldCheck,
    accent: "#72aac6",
    tagline: "Repeatable strength, weighted by how much evidence backs it.",
    format: (v) => v.toFixed(1),
  },
  renown: {
    label: "Renown",
    icon: Crown,
    accent: "#b394e6",
    tagline: "Kills and clears witnessed. History, not skill.",
    format: (v) => Math.round(v).toLocaleString(),
  },
}

export const VIEW_ORDER: RatingView[] = ["overview", ...RATING_METRICS]

export const RANK_COLORS = ["#e6c36a", "#c3c9d2", "#c4824a"]

/** Display title for the deepest level of a scope. */
export function scopeTitle(scope: RatingScope, instanceName: string): string {
  switch (scopeKind(scope)) {
    case "spec":
      return `${scope.spec} ${CLASS_DISPLAY[scope.cls!] ?? scope.cls}`
    case "class":
      return CLASS_DISPLAY[scope.cls!] ?? scope.cls!
    case "boss":
      return scope.boss!
    case "raid":
      return instanceName
  }
}

export function specIconUrl(cls: string, spec: string): string {
  return `/c/icons/spec_${cls.toLowerCase()}_${spec.toLowerCase().replace(/\s+/g, "")}.png`
}
