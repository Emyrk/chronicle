import { Castle, ChartSpline, Puzzle, Search, Shirt, Sparkles, Swords, Trophy, Users, UsersRound, type LucideIcon } from "lucide-react"
import { serverCapabilities } from "@/config/serverCapabilities"

/** One site destination. The desktop menus, the mobile menu, and search all read this list. */
export interface NavLink {
  id: string
  title: string
  href: string
  icon: LucideIcon
  /** One line shown in mega menus and search results. */
  description: string
  /** Extra words search should match ("ladder" finds Leaderboards). */
  keywords?: string[]
  /** Shown as a headline feature in layouts that spotlight features. */
  featured?: boolean
}

export interface NavGroup {
  id: "discover" | "improve" | "build"
  title: string
  /** What the group is for, in a few words, under its title. */
  tagline: string
  links: NavLink[]
}

export function navGroups(): NavGroup[] {
  return [
    {
      id: "discover",
      title: "Discover",
      tagline: "Raids, players and guilds",
      links: [
        { id: "recent", title: "Recent raids", href: "/recent", icon: Castle, description: "The latest uploaded logs", keywords: ["logs", "latest", "uploads"] },
        ...(serverCapabilities.armory
          ? [{ id: "armory", title: "Armory", href: "/armory", icon: Swords, featured: true, description: "Look up any character", keywords: ["player", "character", "gear", "profile"] }]
          : []),
        { id: "guilds", title: "Guilds", href: "/guilds", icon: UsersRound, description: "Rosters and raid nights", keywords: ["guild", "roster"] },
        { id: "census", title: "Census", href: "/census", icon: Users, description: "Class and spec populations", keywords: ["population", "classes", "specs"] },
      ],
    },
    {
      id: "improve",
      title: "Improve",
      tagline: "See how you stack up",
      links: [
        { id: "leaderboards", title: "Leaderboards", href: "/leaderboards", icon: Trophy, featured: true, description: "Ratings, speedruns and stats", keywords: ["rankings", "ladder", "speedrun", "parses", "top", "ratings", "peak", "mastery", "renown", "score"] },
        { id: "performance", title: "Performance", href: "/performance-history", icon: ChartSpline, description: "Your DPS and HPS over time", keywords: ["history", "dps", "hps", "progress"] },
        { id: "search", title: "Search raids", href: "/search", icon: Search, description: "Query across all raids", keywords: ["query", "instances", "logs", "filter"] },
      ],
    },
    {
      id: "build",
      title: "Build",
      tagline: "Plan your next raid",
      links: [
        { id: "talents", title: "Talent Builder", href: "/talents", icon: Sparkles, description: "Plan and share builds", keywords: ["talents", "build", "spec"] },
        { id: "modules", title: "Modules", href: "/modules", icon: Puzzle, description: "Custom panels for your logs", keywords: ["lua", "addons", "panels", "custom", "workshop"] },
        { id: "gear", title: "Gear Builder", href: "/gear/progression", icon: Shirt, description: "Upgrades raid by raid", keywords: ["gear", "bis", "items", "loot"] },
        { id: "raidplanner", title: "Raid Planner", href: "/raidplanner", icon: Users, description: "Groups and assignments", keywords: ["groups", "assignments", "comp", "roster"] },
      ],
    },
  ]
}

export function allNavLinks(groups: NavGroup[] = navGroups()): NavLink[] {
  return groups.flatMap((group) => group.links)
}

export function featuredNavLinks(groups: NavGroup[] = navGroups()): NavLink[] {
  return allNavLinks(groups).filter((link) => link.featured)
}

/** True when the current path is inside a link's section. */
export function isActiveLink(link: NavLink, pathname: string): boolean {
  const base = link.href.split("/").slice(0, 2).join("/")
  return pathname === base || pathname.startsWith(`${base}/`)
}

export type GroupAccent = { title: string; tile: string; rule: string; row: string; here: string; card: string }

/**
 * Each group's colour, shared by the Explore menu and search so a feature looks the same in both.
 * Classes are written out in full so Tailwind can see them.
 */
export const GROUP_ACCENT: Record<NavGroup["id"], GroupAccent> = {
  discover: {
    title: "text-sky-300", rule: "border-sky-400/40",
    tile: "bg-sky-400/15 text-sky-300 group-hover/row:bg-sky-400/30 group-focus/row:bg-sky-400/30 group-data-[active]/row:bg-sky-400/30",
    row: "hover:bg-sky-400/10 focus:bg-sky-400/10", here: "border-sky-300 bg-sky-400/10",
    card: "border-sky-400/30 from-sky-400/15 hover:border-sky-400/60",
  },
  improve: {
    title: "text-amber-300", rule: "border-amber-400/40",
    tile: "bg-amber-400/15 text-amber-300 group-hover/row:bg-amber-400/30 group-focus/row:bg-amber-400/30 group-data-[active]/row:bg-amber-400/30",
    row: "hover:bg-amber-400/10 focus:bg-amber-400/10", here: "border-amber-300 bg-amber-400/10",
    card: "border-amber-400/30 from-amber-400/15 hover:border-amber-400/60",
  },
  build: {
    title: "text-emerald-300", rule: "border-emerald-400/40",
    tile: "bg-emerald-400/15 text-emerald-300 group-hover/row:bg-emerald-400/30 group-focus/row:bg-emerald-400/30 group-data-[active]/row:bg-emerald-400/30",
    row: "hover:bg-emerald-400/10 focus:bg-emerald-400/10", here: "border-emerald-300 bg-emerald-400/10",
    card: "border-emerald-400/30 from-emerald-400/15 hover:border-emerald-400/60",
  },
}

/** The colour of the group a link sits in. */
export function accentFor(link: NavLink): GroupAccent {
  const group = navGroups().find((g) => g.links.some((l) => l.id === link.id))
  return GROUP_ACCENT[group?.id ?? "discover"]
}
