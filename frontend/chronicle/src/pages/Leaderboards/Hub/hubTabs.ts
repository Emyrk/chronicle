import { BarChart3, Gauge, LayoutGrid, Medal, ScrollText, Swords, Timer, type LucideIcon } from "lucide-react"

export type HubTab = "overview" | "ratings" | "performances" | "speedruns" | "statistics" | "parsing" | "rulesets"

export const TABS: { id: HubTab; label: string; icon: LucideIcon; holds: string }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid, holds: "" },
  { id: "ratings", label: "Ratings", icon: Medal, holds: "Peak, Ranked Mastery, and Renown boards (the rating board design)." },
  { id: "performances", label: "Performances", icon: Swords, holds: "Best DPS and HPS from a single recorded log, each row linking to that log." },
  { id: "speedruns", label: "Speedruns", icon: Timer, holds: "Fastest full clears, boss kills, and total kill time for a set of bosses." },
  { id: "statistics", label: "Statistics", icon: BarChart3, holds: "Spec distributions, kill times, full clear times, and success rates." },
  { id: "parsing", label: "Parsing", icon: Gauge, holds: "Parse box plots." },
  { id: "rulesets", label: "Rulesets", icon: ScrollText, holds: "Which targets count for DPS, and what a speedrun must include." },
]
