import { useState, type MouseEvent } from "react"
import { CircleCheck, Skull } from "lucide-react"
import { failed, stripEncounters, type StripEncounter } from "./stripEncounters"

function duration(encounter: StripEncounter): string {
  const seconds = Math.max(0, Math.round((Date.parse(encounter.end_time) - Date.parse(encounter.start_time)) / 1000))
  return Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : ""
}

const filterButton = (on: boolean) => `shrink-0 rounded-md border px-2 py-1 text-[11px] ${on ? "border-primary/60 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"}`

/**
 * Compact encounter picker for the workshop preview, so the panel keeps the pane's full width. Chips wrap
 * up to three rows, then scroll. Click selects one encounter; Ctrl/⌘/Shift-click adds or removes it.
 */
export function EncounterStrip({ encounters, selectedIds, onChange }: {
  encounters: readonly StripEncounter[]
  selectedIds: readonly string[]
  onChange: (ids: string[]) => void
}) {
  const [trash, setTrash] = useState(false)
  const [wipes, setWipes] = useState(false)
  const shown = stripEncounters(encounters, { trash, wipes, selectedIds })
  const select = (event: MouseEvent, id: string) => {
    if (!(event.ctrlKey || event.metaKey || event.shiftKey)) { onChange([id]); return }
    onChange(selectedIds.includes(id) ? selectedIds.filter(selected => selected !== id) : [...selectedIds, id])
  }
  const allSelected = shown.length > 0 && shown.every(encounter => selectedIds.includes(encounter.id))

  return <div className="flex min-w-0 items-start gap-2" role="group" aria-label="Encounters">
    <button type="button" className={filterButton(trash)} aria-pressed={trash} onClick={() => setTrash(!trash)}>Trash</button>
    <button type="button" className={filterButton(wipes)} aria-pressed={wipes} onClick={() => setWipes(!wipes)}>Wipes</button>
    <button type="button" className={filterButton(allSelected)} disabled={!shown.length} onClick={() => onChange(shown.map(encounter => encounter.id))}
      title="Select every encounter shown">All</button>
    <span aria-hidden className="mt-1 h-5 w-px shrink-0 bg-border" />
    <div className="styled-scrollbar flex max-h-[5.5rem] min-w-0 flex-1 flex-wrap gap-1.5 overflow-y-auto">
      {shown.map(encounter => {
        const selected = selectedIds.includes(encounter.id)
        return <button key={encounter.id} type="button" aria-pressed={selected} title={`${encounter.name} · Ctrl/⌘-click to select several`}
          onClick={event => select(event, encounter.id)}
          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-xs ${selected ? "border-primary bg-primary/20 text-foreground" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"} ${encounter.boss ? "" : "italic"}`}>
          {failed(encounter) ? <Skull aria-label="Wipe" className="size-3.5 text-red-400" /> : <CircleCheck aria-label="Kill" className="size-3.5 text-green-500" />}
          {encounter.name}
          <span className="font-mono text-[10px] text-muted-foreground">{duration(encounter)}</span>
        </button>
      })}
      {!shown.length && <span className="py-1 text-xs text-muted-foreground">No boss kills. Turn on Trash or Wipes.</span>}
    </div>
  </div>
}
