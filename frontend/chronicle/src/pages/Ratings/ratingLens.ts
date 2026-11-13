import type { ComponentType, CSSProperties } from "react"
import { BarChart3, Percent } from "lucide-react"
import { METRIC_THEMES } from "@/pages/Leaderboards/Ratings/ratingThemes"
import type { Band } from "./ratingMath"

// Shared vocabulary for the ratings explainer and its embedded calculator.

export const RATING_ACCENT = {
  peak: METRIC_THEMES.peak.accent,
  mastery: METRIC_THEMES.mastery.accent,
  renown: METRIC_THEMES.renown.accent,
}
export const PeakIcon = METRIC_THEMES.peak.icon
export const MasteryIcon = METRIC_THEMES.mastery.icon
export const RenownIcon = METRIC_THEMES.renown.icon

/** The question each number answers. Ratings share their wording with the leaderboard. */
export const QUESTION: Record<Lens, string> = {
  performance: "What did I do on this fight?",
  parse: "How well did I do on this fight compared to my peers?",
  peak: METRIC_THEMES.peak.question!,
  mastery: METRIC_THEMES.mastery.question!,
  renown: METRIC_THEMES.renown.question!,
}

export type Lens = "performance" | "parse" | "peak" | "mastery" | "renown"

export const LENSES: { id: Lens; label: string; Icon: ComponentType<{ className?: string; style?: CSSProperties }>; accent?: string }[] = [
  { id: "performance", label: "Performance", Icon: BarChart3 },
  { id: "parse", label: "Parse", Icon: Percent },
  { id: "peak", label: "Peak", Icon: PeakIcon, accent: RATING_ACCENT.peak },
  { id: "mastery", label: "Mastery", Icon: MasteryIcon, accent: RATING_ACCENT.mastery },
  { id: "renown", label: "Renown", Icon: RenownIcon, accent: RATING_ACCENT.renown },
]

export const BAND_STYLE: Record<Band, { bar: string; label: string; swatch: string }> = {
  ignored: { bar: "bg-muted-foreground/25", label: "Ignored (bottom 20%)", swatch: "bg-muted-foreground/25" },
  floor: { bar: "bg-emerald-500", label: "Floor (next 20%)", swatch: "bg-emerald-500" },
  form: { bar: "bg-sky-400", label: "Form (the rest)", swatch: "bg-sky-400" },
  peak: { bar: "bg-amber-400", label: "Peak (best kill)", swatch: "bg-amber-400" },
}

export const fmt = (n: number, digits = 1) => n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
export const fmtInt = (n: number) => Math.round(n).toLocaleString()
export const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "")
