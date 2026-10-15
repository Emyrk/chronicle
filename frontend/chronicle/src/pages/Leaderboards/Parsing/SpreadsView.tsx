import { useMemo } from "react"
import { ChevronDown } from "lucide-react"
import type { ParseScoreSpread } from "@/api/typesGenerated"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/Checkbox/Checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu"
import { cn } from "@/lib/utils"
import { CLASS_CSS_VAR, CLASS_DISPLAY } from "@/pages/Rankings/classDisplay"
import { hiddenKey, isHidden, setSpecHidden, toggleHidden } from "./parsingState"
import { SpreadChart } from "./SpreadChart"
import { offRoleKeys, spreadSpecLabel } from "./spreadBands"

function specKeyOf(spread: ParseScoreSpread): string {
  return hiddenKey(spread.player_class, spread.player_spec ?? "", spread.player_sub_spec ?? "")
}

/**
 * Every class/spec on one boss as condensed parse spreads. Classes and specs
 * can be hidden to tighten the view; the hidden set lives in `hide`.
 */
export function SpreadsView({
  spreads,
  hidden,
  metricLabel,
  loading,
  showOffRole,
  onShowOffRoleChange,
  onHiddenChange,
  onOpenSpec,
}: {
  spreads: readonly ParseScoreSpread[]
  hidden: ReadonlySet<string>
  metricLabel: string
  loading: boolean
  showOffRole: boolean
  onShowOffRoleChange: (show: boolean) => void
  onHiddenChange: (hide: string) => void
  onOpenSpec: (spread: ParseScoreSpread) => void
}) {
  const classes = useMemo(() => {
    const byClass = new Map<string, ParseScoreSpread[]>()
    for (const spread of spreads) {
      byClass.set(spread.player_class, [...(byClass.get(spread.player_class) ?? []), spread])
    }
    return [...byClass.entries()].sort(([a], [b]) => (CLASS_DISPLAY[a] ?? a).localeCompare(CLASS_DISPLAY[b] ?? b))
  }, [spreads])

  const offRole = useMemo(() => offRoleKeys(spreads, specKeyOf), [spreads])
  const visible = useMemo(
    () =>
      spreads
        .filter((s) => !isHidden(hidden, s.player_class, s.player_spec ?? "", s.player_sub_spec ?? ""))
        .filter((s) => showOffRole || !offRole.has(specKeyOf(s)))
        // Unscored cohorts have no tier cutoffs; keep them below the scored ones.
        .sort((a, b) => Number(a.status === "sample_too_small") - Number(b.status === "sample_too_small")),
    [hidden, offRole, showOffRole, spreads],
  )
  const hiddenCount = spreads.filter((s) => isHidden(hidden, s.player_class, s.player_spec ?? "", s.player_sub_spec ?? "")).length

  const hideSpread = (spread: ParseScoreSpread) => onHiddenChange(toggleHidden(hidden, specKeyOf(spread)))

  return (
    <div className="rounded-xl border bg-card p-3 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {classes.map(([playerClass, classSpreads]) => {
          const shown = classSpreads.filter((s) => !isHidden(hidden, playerClass, s.player_spec ?? "", s.player_sub_spec ?? "")).length
          const state = shown === 0 ? "hidden" : shown < classSpreads.length ? "partial" : "shown"
          return (
            <button
              key={playerClass}
              type="button"
              aria-pressed={state !== "hidden"}
              title={state === "hidden" ? `Show ${CLASS_DISPLAY[playerClass]}` : `Hide ${CLASS_DISPLAY[playerClass]}`}
              onClick={() => {
                // A partly hidden class becomes fully shown; otherwise toggle the class.
                const withoutSpecs = new Set([...hidden].filter((key) => !key.startsWith(`${playerClass}:`)))
                if (state === "shown") withoutSpecs.add(playerClass)
                else withoutSpecs.delete(playerClass)
                onHiddenChange([...withoutSpecs].sort().join(","))
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-all",
                state === "hidden"
                  ? "border-transparent opacity-35 hover:opacity-60"
                  : "border-white/10 text-foreground hover:bg-white/5",
                state === "partial" && "border-dashed",
              )}
              style={state === "shown" ? { borderColor: CLASS_CSS_VAR[playerClass] } : undefined}
            >
              <img
                src={`/c/icons/class_${playerClass.toLowerCase()}.png`}
                alt=""
                className="h-4 w-4"
                onError={(e) => { e.currentTarget.src = "/c/icons/class_unknown.png" }}
              />
              {CLASS_DISPLAY[playerClass] ?? playerClass}
            </button>
          )
        })}

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-xs">
              Specs
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="styled-scrollbar max-h-[60vh] overflow-y-auto">
            {classes.map(([playerClass, classSpreads]) => {
              const classSpecKeys = classSpreads.map(specKeyOf)
              return (
                <div key={playerClass}>
                  <DropdownMenuLabel className="text-xs" style={{ color: CLASS_CSS_VAR[playerClass] }}>
                    {CLASS_DISPLAY[playerClass] ?? playerClass}
                  </DropdownMenuLabel>
                  {classSpreads.map((spread) => {
                    const key = specKeyOf(spread)
                    const shown = !isHidden(hidden, playerClass, spread.player_spec ?? "", spread.player_sub_spec ?? "")
                    return (
                      <DropdownMenuItem
                        key={key}
                        className="gap-2 pl-4 text-xs"
                        onSelect={(e) => {
                          e.preventDefault()
                          onHiddenChange(setSpecHidden(hidden, classSpecKeys, playerClass, key, shown))
                        }}
                      >
                        <Checkbox checked={shown} className="pointer-events-none" />
                        {spreadSpecLabel(spread) || CLASS_DISPLAY[playerClass]}
                      </DropdownMenuItem>
                    )
                  })}
                </div>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {offRole.size > 0 && (
          <button
            type="button"
            onClick={() => onShowOffRoleChange(!showOffRole)}
            title="Specs whose median is under a fifth of the best spec's, such as healers on DPS"
            className="ml-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {showOffRole ? "Hide" : "Show"} {offRole.size} off-role spec{offRole.size === 1 ? "" : "s"}
          </button>
        )}
        {hidden.size > 0 && (
          <button
            type="button"
            onClick={() => onHiddenChange("")}
            className="ml-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Show all{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ""}
          </button>
        )}
      </div>

      {loading && spreads.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : spreads.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No parses on this boss in the last 60 days.</p>
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Every spec is hidden. Pick a class above to show it.</p>
      ) : (
        <SpreadChart spreads={visible} metricLabel={metricLabel} onRowClick={onOpenSpec} onHide={hideSpread} />
      )}
    </div>
  )
}
