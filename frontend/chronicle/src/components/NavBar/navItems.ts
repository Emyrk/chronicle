import { Castle, ChartSpline, Medal, Puzzle, Search, Shirt, Sparkles, Swords, Trophy, Users, UsersRound, type LucideIcon } from "lucide-react"
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
  links: NavLink[]
}

export function navGroups(): NavGroup[] {
  return [
    {
      id: "discover",
      title: "Discover",
      links: [
        { id: "recent", title: "Recent raids", href: "/recent", icon: Castle, description: "The latest logs uploaded to Chronicle.", keywords: ["logs", "latest", "uploads"] },
        { id: "leaderboards", title: "Leaderboards", href: "/leaderboards", icon: Trophy, featured: true, description: "Ratings, top performances, speedruns, and statistics for every raid.", keywords: ["rankings", "ladder", "speedrun", "parses", "top"] },
        ...(serverCapabilities.armory
          ? [{ id: "armory", title: "Armory", href: "/armory", icon: Swords, featured: true, description: "Look up any character's gear, career ratings, and raid history.", keywords: ["player", "character", "gear", "profile"] }]
          : []),
        { id: "guilds", title: "Guilds", href: "/guilds", icon: UsersRound, description: "Find a guild, its roster, and its raid nights.", keywords: ["guild", "roster"] },
        { id: "search", title: "Search raids", href: "/search", icon: Search, description: "Query every raid with filters like boss, player, and kill time.", keywords: ["query", "instances", "logs", "filter"] },
        { id: "census", title: "Census", href: "/census", icon: Users, description: "Class, spec, and population trends across realms.", keywords: ["population", "classes", "specs"] },
      ],
    },
    {
      id: "improve",
      title: "Improve",
      links: [
        { id: "ratings", title: "Ratings", href: "/ratings", icon: Medal, featured: true, description: "How Peak, Mastery, and Renown work, and where you stand.", keywords: ["peak", "mastery", "renown", "score"] },
        { id: "performance", title: "Performance", href: "/performance-history", icon: ChartSpline, description: "Your DPS and HPS over time, boss by boss.", keywords: ["history", "dps", "hps", "progress"] },
      ],
    },
    {
      id: "build",
      title: "Build",
      links: [
        { id: "modules", title: "Modules", href: "/modules", icon: Puzzle, description: "Custom Lua panels for your raid logs. Use one or build your own.", keywords: ["lua", "addons", "panels", "custom", "workshop"] },
        { id: "talents", title: "Talent Builder", href: "/talents", icon: Sparkles, description: "Plan and share talent builds.", keywords: ["talents", "build", "spec"] },
        { id: "gear", title: "Gear Builder", href: "/gear/progression", icon: Shirt, description: "Plan gear upgrades raid by raid.", keywords: ["gear", "bis", "items", "loot"] },
        { id: "raidplanner", title: "Raid Planner", href: "/raidplanner", icon: Users, description: "Arrange groups and assignments for raid night.", keywords: ["groups", "assignments", "comp", "roster"] },
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
