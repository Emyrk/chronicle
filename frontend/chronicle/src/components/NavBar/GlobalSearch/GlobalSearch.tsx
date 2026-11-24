import { useEffect, useRef, useState, type ReactNode } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowRight, Loader2, Search, Trophy, UsersRound, type LucideIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { useMyFavorites } from "@/api/queries"
import { useAuth } from "@/hooks/useAuth"
import { usePortalContainer } from "@/components/ui/PortalContainerContext"
import { getClassColorVar } from "@/pages/ArmoryPage/types"
import { cn } from "@/lib/utils"
import { accentFor, featuredNavLinks, GROUP_ACCENT, type NavLink } from "../navItems"
import {
  guildHref, playerHref,
  type GlobalSearchResults, type RankingMatch, type TopResult,
} from "./globalSearch"
import { useGlobalSearch } from "./useGlobalSearch"

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

/** The navbar's search button: a wide field on desktop, or just the icon. */
export function SearchTrigger({ onOpen, compact, className }: { onOpen: () => void; compact?: boolean; className?: string }) {
  if (compact) {
    return (
      <button type="button" onClick={onOpen} aria-label="Search" className={cn("rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground", className)}>
        <Search className="h-5 w-5" />
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn("@container flex h-9 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground", className)}
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="truncate">Search…</span>
      <kbd className="ml-auto hidden whitespace-nowrap rounded border bg-background px-1.5 font-mono text-[10px] lg:@[11rem]:inline">{isMac ? "⌘" : "Ctrl "}K</kbd>
    </button>
  )
}

interface Row {
  key: string
  href: string
  render: (active: boolean) => ReactNode
}

function RowLink({ row, active, onSelect, onHover }: { row: Row; active: boolean; onSelect: () => void; onHover: () => void }) {
  return (
    <Link
      to={row.href}
      data-active={active || undefined}
      onClick={onSelect}
      onMouseMove={onHover}
      className={cn("group/row flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors", active ? "bg-foreground/[0.07] text-foreground" : "text-muted-foreground")}
    >
      {row.render(active)}
    </Link>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      {children}
    </div>
  )
}

/** A tinted icon tile, the same shape the Explore menu uses. */
function Tile({ icon: Icon, className, color }: { icon?: LucideIcon; className?: string; color?: string }) {
  return (
    <span
      className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors", className)}
      style={color ? { background: `color-mix(in srgb, ${color} 18%, transparent)`, color } : undefined}
    >
      {Icon ? <Icon className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
    </span>
  )
}

const LEADERBOARD = GROUP_ACCENT.improve
const GUILD = GROUP_ACCENT.discover

function rankingLabel(ranking: RankingMatch) {
  return ranking.boss ? `${ranking.boss} — ${ranking.instance}` : ranking.instance
}

/** The large "answer" card above the list, like a search engine's top result. */
function TopResultCard({ top, onSelect }: { top: TopResult; onSelect: () => void }) {
  const card = "block rounded-lg border bg-gradient-to-br to-transparent p-4 transition-colors"
  switch (top.kind) {
    case "player": {
      const { player } = top
      return (
        <Link
          to={playerHref(player)}
          onClick={onSelect}
          className={card}
          style={{ borderColor: `color-mix(in srgb, ${getClassColorVar(player.class)} 40%, transparent)`, backgroundImage: `linear-gradient(to bottom right, color-mix(in srgb, ${getClassColorVar(player.class)} 14%, transparent), transparent)` }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: getClassColorVar(player.class) }}>Character</div>
          <div className="mt-1 text-xl font-semibold" style={{ color: getClassColorVar(player.class) }}>{player.name}</div>
          <div className="text-sm text-muted-foreground">
            {player.class} · {player.realm_name}
          </div>
          <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary">Open in Armory <ArrowRight className="h-3 w-3" /></div>
        </Link>
      )
    }
    case "guild": {
      const { guild } = top
      return (
        <Link to={guildHref(guild)} onClick={onSelect} className={cn(card, GUILD.card, "flex items-center gap-4")}>
          <UsersRound className={cn("h-10 w-10", GUILD.title)} />
          <div>
            <div className={cn("text-[11px] font-semibold uppercase tracking-wider", GUILD.title)}>Guild</div>
            <div className="text-xl font-semibold text-foreground">&lt;{guild.name}&gt;</div>
            <div className="text-sm text-muted-foreground">{guild.realm_name}</div>
          </div>
        </Link>
      )
    }
    case "ranking": {
      const { ranking } = top
      return (
        <div className={cn(card, LEADERBOARD.card)}>
          <Link to={ranking.href} onClick={onSelect} className="flex items-start gap-3">
            <Trophy className={cn("mt-1 h-6 w-6 shrink-0", LEADERBOARD.title)} />
            <div>
              <div className={cn("text-[11px] font-semibold uppercase tracking-wider", LEADERBOARD.title)}>{ranking.boss ? "Boss" : "Instance"}</div>
              <div className="text-xl font-semibold text-foreground">{ranking.boss ?? ranking.instance}</div>
              {ranking.boss && <div className="text-sm text-muted-foreground">{ranking.instance}</div>}
            </div>
          </Link>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {ranking.tabs.map((tab) => (
              <Link key={tab.label} to={tab.href} onClick={onSelect} className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-xs text-amber-100 transition-colors hover:border-amber-300 hover:bg-amber-400/20">
                {tab.label}
              </Link>
            ))}
          </div>
        </div>
      )
    }
    case "page": {
      const { link } = top
      const accent = accentFor(link)
      return (
        <Link to={link.href} onClick={onSelect} className={cn(card, accent.card, "flex items-start gap-3")}>
          <link.icon className={cn("mt-1 h-6 w-6 shrink-0", accent.title)} />
          <div>
            <div className="text-xl font-semibold text-foreground">{link.title}</div>
            <div className="text-sm text-muted-foreground">{link.description}</div>
          </div>
        </Link>
      )
    }
  }
}

function pageRow(link: NavLink): Row {
  return {
    key: `page:${link.id}`,
    href: link.href,
    render: () => (
      <>
        <Tile icon={link.icon} className={accentFor(link).tile} />
        <span className="text-foreground">{link.title}</span>
        <span className="truncate text-xs">{link.description}</span>
      </>
    ),
  }
}

function useRows(query: string, results: GlobalSearchResults & { raidHref: string }, isAuthenticated: boolean) {
  const { data: favorites } = useMyFavorites({ enabled: isAuthenticated })
  const q = query.trim()
  if (!q) {
    const sections: { title: string; rows: Row[] }[] = []
    const favRows: Row[] = [
      ...(favorites?.players ?? []).slice(0, 4).map((player): Row => ({
        key: `fav-player:${player.id}`,
        href: playerHref(player),
        render: () => <><Tile color={getClassColorVar(player.class)} /><span style={{ color: getClassColorVar(player.class) }}>{player.name}</span></>,
      })),
      ...(favorites?.guilds ?? []).slice(0, 3).map((guild): Row => ({
        key: `fav-guild:${guild.id}`,
        href: guildHref(guild),
        render: () => <><Tile icon={UsersRound} className={GUILD.tile} /><span className="text-foreground">&lt;{guild.name}&gt;</span></>,
      })),
    ]
    if (favRows.length) sections.push({ title: "Favorites", rows: favRows })
    sections.push({ title: "Jump to", rows: featuredNavLinks().map(pageRow) })
    return sections
  }
  const sections: { title: string; rows: Row[] }[] = []
  if (results.rankings.length) {
    sections.push({
      title: "Instances and bosses",
      rows: results.rankings.map((ranking) => ({
        key: `rank:${ranking.instance}:${ranking.boss ?? ""}`,
        href: ranking.href,
        render: () => <><Tile icon={Trophy} className={LEADERBOARD.tile} /><span className="text-foreground">{rankingLabel(ranking)}</span></>,
      })),
    })
  }
  if (results.players.length) {
    sections.push({
      title: "Characters",
      rows: results.players.map((player) => ({
        key: `player:${player.realm_id}:${player.id}`,
        href: playerHref(player),
        render: () => (
          <>
            <Tile color={getClassColorVar(player.class)} />
            <span className="font-medium" style={{ color: getClassColorVar(player.class) }}>{player.name}</span>
            <span className="truncate text-xs">{player.class} · {player.realm_name}</span>
          </>
        ),
      })),
    })
  }
  if (results.guilds.length) {
    sections.push({
      title: "Guilds",
      rows: results.guilds.map((guild) => ({
        key: `guild:${guild.id}`,
        href: guildHref(guild),
        render: () => <><Tile icon={UsersRound} className={GUILD.tile} /><span className="text-foreground">&lt;{guild.name}&gt;</span><span className="text-xs">{guild.realm_name}</span></>,
      })),
    })
  }
  if (results.pages.length) sections.push({ title: "Pages", rows: results.pages.map(pageRow) })
  sections.push({
    title: "Raids",
    rows: [{
      key: "raid-search",
      href: results.raidHref,
      render: () => <><Tile icon={Search} className={LEADERBOARD.tile} /><span className="text-foreground">Search raids for “{q}”</span></>,
    }],
  })
  return sections
}

export function SearchPalette({ open, onOpenChange, initialQuery = "" }: { open: boolean; onOpenChange: (open: boolean) => void; initialQuery?: string }) {
  const container = usePortalContainer()
  const [query, setQuery] = useState(initialQuery)
  const [active, setActive] = useState(0)
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const results = useGlobalSearch(query, open)
  const sections = useRows(query, results, isAuthenticated)
  const rows = sections.flatMap((section) => section.rows)
  const listRef = useRef<HTMLDivElement>(null)
  const close = () => onOpenChange(false)
  const activeIndex = Math.min(active, rows.length - 1)

  useEffect(() => {
    listRef.current?.querySelector("[data-active]")?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const step = event.key === "ArrowDown" ? 1 : -1
      setActive((activeIndex + step + rows.length) % rows.length)
    } else if (event.key === "Enter" && rows[activeIndex]) {
      event.preventDefault()
      navigate(rows[activeIndex].href)
      close()
    }
  }

  const offsets = sections.map((_, i) => sections.slice(0, i).reduce((sum, section) => sum + section.rows.length, 0))
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) { setQuery(""); setActive(0) } }}>
      <DialogPrimitive.Portal container={container}>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          className="fixed inset-x-0 top-0 z-50 flex h-dvh flex-col overflow-hidden bg-background sm:inset-x-auto sm:left-1/2 sm:top-[10vh] sm:h-auto sm:max-h-[75vh] sm:w-[640px] sm:-translate-x-1/2 sm:rounded-xl sm:border sm:border-foreground/15 sm:bg-popover sm:shadow-2xl sm:shadow-black/60"
        >
          <DialogPrimitive.Title className="sr-only">Search Chronicle</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b px-4">
            {results.loading ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" /> : <Search className="h-5 w-5 shrink-0 text-muted-foreground" />}
            <input
              autoFocus
              value={query}
              onChange={(event) => { setQuery(event.target.value); setActive(0) }}
              placeholder="Search characters, guilds, raids, bosses, pages…"
              className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
            <DialogPrimitive.Close className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground">
              <span className="sm:hidden">Cancel</span><span className="hidden sm:inline">Esc</span>
            </DialogPrimitive.Close>
          </div>
          <div role="status" className="px-4 text-xs text-muted-foreground">{results.status}</div>
          <div ref={listRef} className="styled-scrollbar flex-1 overflow-y-auto p-2">
            {query.trim().length >= 2 && results.top && (
              <div className="p-1 pb-2"><TopResultCard top={results.top} onSelect={close} /></div>
            )}
            {sections.map((section, sectionIndex) => (
              <Section key={section.title} title={section.title}>
                {section.rows.map((row, i) => {
                  const rowIndex = offsets[sectionIndex] + i
                  return <RowLink key={row.key} row={row} active={rowIndex === activeIndex} onSelect={close} onHover={() => setActive(rowIndex)} />
                })}
              </Section>
            ))}
          </div>
          <div className="hidden items-center gap-4 border-t px-4 py-2 text-[11px] text-muted-foreground sm:flex">
            <span><kbd className="font-mono">↑↓</kbd> to move</span>
            <span><kbd className="font-mono">↵</kbd> to open</span>
            <span className="ml-auto">Tip: try a boss name, a raid like “bwl”, or a character</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
