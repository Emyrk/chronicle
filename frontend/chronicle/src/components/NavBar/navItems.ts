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
        { id: "search", title: "Search raids", href: "/search", icon: Search, description: "Dig through every logged raid", keywords: ["query", "instances", "logs", "filter"] },
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
      ],
    },
    {
      id: "build",
      title: "Build",
      tagline: "Plan your next raid",
      links: [
        { id: "talents", title: "Talent Builder", href: "/talents", icon: Sparkles, description: "Plan and share builds", keywords: ["talents", "build", "spec"] },
        { id: "gear", title: "Gear Builder", href: "/gear/progression", icon: Shirt, description: "Upgrades raid by raid", keywords: ["gear", "bis", "items", "loot"] },
        { id: "raidplanner", title: "Raid Planner", href: "/raidplanner", icon: Users, description: "Groups and assignments", keywords: ["groups", "assignments", "comp", "roster"] },
        { id: "modules", title: "Modules", href: "/modules", icon: Puzzle, description: "Custom panels for your logs", keywords: ["lua", "addons", "panels", "custom", "workshop"] },
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
