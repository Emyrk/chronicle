import type { ReactNode } from "react"
import { CheckCircle, PanelLeftClose } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { FULL_CLEAR, type EncounterSelection } from "./encounterSelection"

/**
 * Left-hand encounter list, matching the statistics leaderboard sidebar
 * (Rankings/InstanceView): click picks one, Ctrl+Click combines. "Full clear"
 * is its own entry because whole-raid runs are not the same as every boss combined.
 */
export function EncounterSidebar({
  bosses,
  optional,
  selection,
  onSelect,
  onCollapse,
  allowCombine = true,
}: {
  bosses: readonly string[]
  optional: ReadonlySet<string>
  selection: EncounterSelection
  onSelect: (selection: EncounterSelection) => void
  /** Collapse the column to the left (the instance page's "Hide sidebar"). */
  onCollapse?: () => void
  /** Disable mock-only multi-boss aggregation on live leaderboards. */
  allowCombine?: boolean
}) {
  const chosen = new Set(selection.kind === "bosses" ? selection.bosses : [])
  const required = bosses.filter((b) => !optional.has(b))
  const extra = bosses.filter((b) => optional.has(b))

  const pick = (boss: string, combine: boolean) => {
    if (!combine || !allowCombine) return onSelect({ kind: "bosses", bosses: [boss] })
    const next = new Set(chosen)
    if (next.has(boss)) next.delete(boss)
    else next.add(boss)
    // Keep raid order so titles and boards read top to bottom.
    const ordered = bosses.filter((b) => next.has(b))
    onSelect(ordered.length ? { kind: "bosses", bosses: ordered } : FULL_CLEAR)
  }

  return (
    <nav aria-label="Encounters">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Encounters</h3>
        {onCollapse && (
          <Button variant="ghost" size="icon" className="-mr-1 h-6 w-6" onClick={onCollapse} title="Hide sidebar" aria-label="Hide encounters">
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
      </div>

      {allowCombine && <div className="mt-1.5 flex gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-5 px-1.5 text-xs"
          onClick={() => onSelect({ kind: "bosses", bosses: required })}
          title="Combine every required boss: total kill time, not a full clear"
        >
          All bosses
        </Button>
      </div>}

      <div className="mt-3 space-y-4">
        <Section label="Raid">
          <Row
            name="Full clear"
            selected={selection.kind === "clear"}
            onClick={() => onSelect(FULL_CLEAR)}
            title="Whole-raid runs: clear time and raid ratings"
          />
        </Section>
        <Section label="Bosses">
          {required.map((name) => (
            <Row key={name} name={name} selected={chosen.has(name)} title={!allowCombine ? `Show ${name} ratings` : undefined} onClick={(combine) => pick(name, combine)} />
          ))}
        </Section>
        {extra.length > 0 && (
          <Section label="Optional">
            {extra.map((name) => (
              <Row key={name} name={name} selected={chosen.has(name)} subdued title={!allowCombine ? `Show ${name} ratings` : undefined} onClick={(combine) => pick(name, combine)} />
            ))}
          </Section>
        )}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground/50">
        {allowCombine
          ? "Full clear uses whole-raid runs. Ctrl+Click to combine bosses: ratings average across them and time is total kill time."
          : "Choose the raid board or a single encounter. Realm filters change only the displayed rows."}
      </p>
    </nav>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-1.5 px-3 text-[10px] font-semibold tracking-wider text-muted-foreground/70 uppercase">{label}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Row({
  name,
  selected,
  subdued,
  title,
  onClick,
}: {
  name: string
  selected: boolean
  subdued?: boolean
  title?: string
  onClick: (combine: boolean) => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={(e) => onClick(e.ctrlKey || e.metaKey)}
      title={title ?? `${name}. Click to select, Ctrl+Click to toggle`}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-all duration-150",
        selected
          ? "border-l-3 border-l-primary-foreground/70 bg-primary-darker text-primary-foreground shadow-sm"
          : "hover:translate-x-0.5 hover:bg-accent/50",
        !selected && subdued && "text-muted-foreground",
      )}
    >
      <CheckCircle className={cn("h-4 w-4 shrink-0", subdued ? "text-green-500/60" : "text-green-500")} />
      <span className="flex-1 truncate">{name}</span>
    </button>
  )
}
