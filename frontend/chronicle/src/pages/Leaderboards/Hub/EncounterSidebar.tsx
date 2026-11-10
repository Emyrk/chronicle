import type { ReactNode } from "react"
import { CheckCircle, PanelLeftClose } from "lucide-react"
import { bossEntity, entityAttributes } from "@/components/EntityMenu/entity"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { FULL_CLEAR, selectedBosses, toggleEncounter, type EncounterSelection } from "./encounterSelection"

/**
 * Left-hand encounter list, as on /leaderboards (Rankings/InstanceView): the
 * preset (every default boss) is selected on entry, click picks one boss, and
 * Ctrl+Click adds or removes one. Selected bosses are always highlighted.
 */
export function EncounterSidebar({
  instanceName,
  bosses,
  preset: defaultBosses,
  optional,
  trash = new Set<string>(),
  selection,
  onSelect,
  onCollapse,
}: {
  instanceName: string
  bosses: readonly string[]
  preset?: readonly string[]
  optional: ReadonlySet<string>
  trash?: ReadonlySet<string>
  selection: EncounterSelection
  onSelect: (selection: EncounterSelection) => void
  /** Collapse the column to the left (the instance page's "Hide sidebar"). */
  onCollapse?: () => void
}) {
  const preset = (defaultBosses ?? bosses).filter((b) => !trash.has(b))
  const chosen = new Set(selectedBosses(selection, preset))
  const required = bosses.filter((b) => !optional.has(b) && !trash.has(b))
  const extra = bosses.filter((b) => optional.has(b) && !trash.has(b))
  const trashNames = bosses.filter((b) => trash.has(b))
  const pick = (boss: string, combine: boolean) => onSelect(toggleEncounter(selection, preset, bosses, boss, combine))

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

      <div className="mt-1.5 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-5 px-1.5 text-xs"
          aria-pressed={selection.kind === "clear"}
          onClick={() => onSelect(FULL_CLEAR)}
          title="Select every boss again"
        >
          All bosses
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {chosen.size} of {preset.length} selected
        </span>
      </div>

      <div className="mt-3 space-y-4">
        <Section label="Bosses">
          {required.map((name) => (
            <Row key={name} instanceName={instanceName} name={name} selected={chosen.has(name)} onClick={(combine) => pick(name, combine)} />
          ))}
        </Section>
        {extra.length > 0 && (
          <Section label="Optional">
            {extra.map((name) => (
              <Row key={name} instanceName={instanceName} name={name} selected={chosen.has(name)} subdued onClick={(combine) => pick(name, combine)} />
            ))}
          </Section>
        )}
        {trashNames.length > 0 && (
          <Section label="Trash">
            {trashNames.map((name) => (
              <Row key={name} instanceName={instanceName} name={name} selected={chosen.has(name)} onClick={(combine) => pick(name, combine)} />
            ))}
          </Section>
        )}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground/50">
        Click a boss to show only it; Ctrl+Click adds or removes one. Ratings average over the selected bosses (a missed boss counts as 0).
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
  instanceName,
  name,
  selected,
  subdued,
  title,
  onClick,
}: {
  instanceName: string
  name: string
  selected: boolean
  subdued?: boolean
  title?: string
  onClick: (combine: boolean) => void
}) {
  return (
    <button
      type="button"
      {...entityAttributes(bossEntity(instanceName, name))}
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
