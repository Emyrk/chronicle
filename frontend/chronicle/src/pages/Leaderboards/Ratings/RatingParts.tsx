import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { ClassIcon } from "@/pages/RaidPlanner/ClassIcon"
import { CLASS_CSS_VAR } from "@/pages/Rankings/classDisplay"
import { getBossPortrait } from "./bossPortraits"
import { scopeKind, type RatingEntry, type RatingScope } from "./ratingBoards.fixtures"
import { RANK_COLORS, specIconUrl, type MetricTheme } from "./ratingThemes"

export function SpecIcon({ cls, spec, className }: { cls: string; spec: string; className?: string }) {
  return (
    <img
      src={specIconUrl(cls, spec)}
      alt={spec}
      className={className}
      onError={(e) => {
        ;(e.target as HTMLImageElement).src = `/c/icons/class_${cls.toLowerCase()}.png`
      }}
    />
  )
}

export function EntryRow({ entry, rank, theme, size }: { entry: RatingEntry; rank: number; theme: MetricTheme; size: "lg" | "sm" }) {
  const lg = size === "lg"
  return (
    <li className={cn("flex items-center gap-3 border-b border-white/5 last:border-b-0", lg ? "px-4 py-3 sm:px-5" : "px-3 py-2")}>
      <RankMark rank={rank} size={size} />
      <SpecIcon cls={entry.cls} spec={entry.spec} className={cn("shrink-0 rounded-sm", lg ? "size-7" : "size-5")} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className={cn("max-w-full shrink-0 truncate font-medium", lg ? "text-base" : "text-sm")} style={{ color: CLASS_CSS_VAR[entry.cls] }}>
            {entry.name}
          </span>
          {entry.guild && <span className="min-w-0 truncate text-xs text-muted-foreground">&lt;{entry.guild}&gt;</span>}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {entry.spec} · {entry.detail}
        </span>
      </span>
      <span
        className={cn("shrink-0 text-right font-mono tabular-nums", lg ? "text-xl" : "text-sm")}
        style={rank === 1 ? { color: theme.accent } : undefined}
      >
        {theme.format(entry.score)}
      </span>
    </li>
  )
}

export function RankMark({ rank, size }: { rank: number; size: "lg" | "sm" }) {
  const color = RANK_COLORS[rank - 1]
  const box = size === "lg" ? "size-8" : "size-6"
  if (!color) {
    return <span className={cn("flex shrink-0 items-center justify-center font-mono text-xs text-muted-foreground", box)}>{rank}</span>
  }
  return (
    <span className={cn("relative flex shrink-0 items-center justify-center", box)} style={{ color }} aria-label={`Rank ${rank}`}>
      <Laurel className="absolute inset-0 size-full" />
      <span className={cn("relative font-mono font-semibold", size === "lg" ? "text-xs" : "text-[10px]")}>{rank}</span>
    </span>
  )
}

export function Emblem({ size, children, accent }: { size: "lg" | "sm"; children: ReactNode; accent?: boolean }) {
  return (
    <span className={cn("relative flex shrink-0 items-center justify-center", size === "lg" ? "size-20" : "size-10")}>
      <Laurel className={cn("absolute inset-0 size-full", accent ? "text-[color:var(--metric)] opacity-70" : "text-muted-foreground/50")} />
      <span className="relative">{children}</span>
    </span>
  )
}

/** Boss face icon when available, otherwise initials. */
export function BossPortrait({ boss, size }: { boss: string; size: "lg" | "md" | "sm" }) {
  const src = getBossPortrait(boss)
  const box = size === "lg" ? "size-16" : size === "md" ? "size-11" : "size-7"
  if (src) {
    return <img src={src} alt={boss} className={cn("rounded-full border border-white/15 object-cover", box)} />
  }
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-full border border-white/10 bg-black/30 font-wow text-muted-foreground",
        box,
        size === "lg" ? "text-xl" : size === "md" ? "text-sm" : "text-[11px]",
      )}
      aria-label={boss}
    >
      {initials(boss)}
    </span>
  )
}

/** The emblem content for any scope: boss face, class icon, or spec icon. */
export function ScopeMark({ scope, size }: { scope: RatingScope; size: "lg" | "sm" }) {
  const kind = scopeKind(scope)
  const icon = size === "lg" ? "size-9" : "size-5"
  if (kind === "spec") return <SpecIcon cls={scope.cls!} spec={scope.spec!} className={cn("rounded-sm", icon)} />
  if (kind === "class") return <ClassIcon cls={scope.cls!} className={cn("rounded-sm", icon)} />
  if (kind === "boss") return <BossPortrait boss={scope.boss!} size={size === "lg" ? "md" : "sm"} />
  return null
}

const LAUREL_LEAVES = Array.from({ length: 7 }, (_, i) => {
  // Leaves sit on an arc from the bottom center up the left side.
  const theta = ((105 + i * 21) * Math.PI) / 180
  const r = 38
  const x = 50 + r * Math.cos(theta)
  const y = 52 + r * Math.sin(theta)
  const rotate = (theta * 180) / Math.PI + 90 + (i % 2 === 0 ? -28 : 28)
  return { x, y, rotate, rx: 7 + i * 0.3, ry: 2.8 }
})

/** Simple laurel wreath drawn in currentColor. */
export function Laurel({ className }: { className?: string }) {
  const leaves = LAUREL_LEAVES.map((l, i) => (
    <ellipse key={i} cx={l.x} cy={l.y} rx={l.rx} ry={l.ry} transform={`rotate(${l.rotate} ${l.x} ${l.y})`} />
  ))
  return (
    <svg viewBox="0 0 100 100" className={className} fill="currentColor" aria-hidden>
      <g>{leaves}</g>
      <g transform="translate(100 0) scale(-1 1)">{leaves}</g>
    </svg>
  )
}

function initials(name: string): string {
  return name
    .split(/[\s-]+/)
    .filter((w) => w.length > 2 && w !== "the")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
}
