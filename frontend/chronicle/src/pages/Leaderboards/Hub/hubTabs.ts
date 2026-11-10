import { BarChart3, Gauge, LayoutGrid, Medal, ScrollText, Swords, Timer, type LucideIcon } from "lucide-react"

export type HubTab = "overview" | "ratings" | "performances" | "speedruns" | "statistics" | "parsing" | "rulesets"

export const TABS: { id: HubTab; label: string; icon: LucideIcon; holds: string; description: string }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid, holds: "", description: "Each raid's headline leaders at a glance: fastest clear, top Peak, guild Renown, and best performance." },
  { id: "ratings", label: "Ratings", icon: Medal, holds: "Peak, Ranked Mastery, and Renown boards (the rating board design).", description: "Character and guild boards for Peak, Ranked Mastery, and Renown." },
  { id: "performances", label: "Performances", icon: Swords, holds: "Best DPS and HPS from a single recorded log, each row linking to that log.", description: "Best single-fight DPS and HPS, each linking to the log it came from." },
  { id: "speedruns", label: "Speedruns", icon: Timer, holds: "Fastest full clears, boss kills, and total kill time for a set of bosses.", description: "Fastest full clears, boss kills, and combined kill times for a set of bosses." },
  { id: "statistics", label: "Statistics", icon: BarChart3, holds: "Spec distributions, kill times, full clear times, and success rates.", description: "Spec distributions, kill times, full clear times, and success rates." },
  { id: "parsing", label: "Parsing", icon: Gauge, holds: "Parse box plots.", description: "How parses spread across specs, per-spec details, and kill-time distributions." },
  { id: "rulesets", label: "Rulesets", icon: ScrollText, holds: "Which targets count for DPS, and what a speedrun must include.", description: "Which targets count for DPS, and what a speedrun must include." },
]
