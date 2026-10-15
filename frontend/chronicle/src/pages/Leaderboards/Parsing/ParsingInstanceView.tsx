import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { ArrowLeft, BarChart3, CheckCircle, ChevronDown, CircleDashed, Loader2, UserRound } from "lucide-react"
import { useSiteConfig, useSupportedInstanceProgressionBosses } from "@/api/queries"
import { useParseScoreSpreads, useRankingsEncounters } from "@/api/rankingsQueries"
import type { ParseScoreSpread } from "@/api/typesGenerated"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu"
import { useIsMobile } from "@/hooks/useIsMobile"
import { cn } from "@/lib/utils"
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages"
import { rankingEncounterNames, rankingEncounterSections } from "@/pages/Rankings/rankingsEncounterSelection"
import {
  PARSING_PREFS_KEY,
  PARSING_SELECTION_PARAMS,
  parseHidden,
  parsingMetric,
  parsingView,
  prefsFromParams,
  readParsingPrefs,
  restoreParsingParams,
  type ParsingMetric,
  type ParsingView,
} from "./parsingState"
import { SpecView } from "./SpecView"
import { SpreadsView } from "./SpreadsView"
import { difficultyLabel, selectSpreadDifficulty, spreadDifficulties } from "./spreadBands"

function readStoredPrefs() {
  try {
    return readParsingPrefs(localStorage.getItem(PARSING_PREFS_KEY))
  } catch {
    return readParsingPrefs(null)
  }
}

/**
 * Keeps the URL and localStorage in sync: a bare URL is filled from the last
 * visit, and every change is remembered for the next one.
 */
function useParsingParams(instanceName: string) {
  const [params, setParams] = useSearchParams()
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    const next = restoreParsingParams(params, readStoredPrefs(), instanceName)
    if (next) setParams(next, { replace: true })
    setRestored(true)
    // Restore once per instance visit; later param changes are the user's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceName])

  useEffect(() => {
    if (!restored) return
    try {
      localStorage.setItem(PARSING_PREFS_KEY, JSON.stringify(prefsFromParams(params, readStoredPrefs(), instanceName)))
    } catch {
      // Storage may be unavailable (private mode); the URL still works.
    }
  }, [instanceName, params, restored])

  const update = useCallback(
    (changes: Record<string, string>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value)
            else next.delete(key)
          }
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  return { params, update, restored }
}

/** Per-instance parse targets: spreads for every spec, or one spec in depth. */
export function ParsingInstanceView({ instanceName }: { instanceName: string }) {
  const { params, update, restored } = useParsingParams(instanceName)
  const isMobile = useIsMobile()
  const view = parsingView(params)
  const metric = parsingMetric(params)
  const metricLabel = metric.toUpperCase()
  const hidden = useMemo(() => parseHidden(params.get("hide")), [params])

  const { data: siteConfig } = useSiteConfig()
  const configuredMode = siteConfig?.tenant?.parse_config?.cohort_mode
  const cohortMode = configuredMode === "class" || configuredMode === "disabled" ? configuredMode : "spec"

  // Bosses in progression order, as on the statistics tab. Trash has no parses.
  const { data: encounterSummaries, isLoading: encountersLoading } = useRankingsEncounters(instanceName)
  const { data: progressionBosses } = useSupportedInstanceProgressionBosses()
  const progression = progressionBosses?.get(instanceName)
  const recordedNames = useMemo(() => new Set((encounterSummaries ?? []).map((e) => e.encounter_name)), [encounterSummaries])
  const bosses = useMemo(
    () => rankingEncounterNames([...recordedNames], progression).filter((name) => name !== "Trash"),
    [progression, recordedNames],
  )
  const sections = useMemo(
    () => rankingEncounterSections(bosses, new Set(progression ?? bosses)),
    [bosses, progression],
  )
  const requestedBoss = params.get("boss") ?? ""
  const boss = bosses.includes(requestedBoss) ? requestedBoss : (bosses.find((b) => recordedNames.has(b)) ?? bosses[0] ?? "")

  const bossQuery = useParseScoreSpreads({ metric, encounterNames: boss ? [boss] : [] }, restored)
  const allBossSpreads = useMemo(() => bossQuery.data?.spreads ?? [], [bossQuery.data])
  const difficulties = useMemo(() => spreadDifficulties(allBossSpreads), [allBossSpreads])
  const difficulty = selectSpreadDifficulty(difficulties, params.get("diff") ?? "", params.get("size") ?? "")
  const bossSpreads = useMemo(
    () =>
      allBossSpreads.filter(
        (s) => s.difficulty_name === difficulty?.difficultyName && s.max_players === difficulty?.maxPlayers,
      ),
    [allBossSpreads, difficulty],
  )

  const setMetric = (next: ParsingMetric) => {
    if (next === metric) return
    // Hidden rows are remembered per metric (healers on DPS, DPS on HPS).
    update({ metric: next === "dps" ? "" : next, hide: readStoredPrefs().hidden[next].join(",") })
  }
  const setView = (next: ParsingView) => update({ view: next === "spreads" ? "" : next })
  const openSpec = (spread: ParseScoreSpread) =>
    update({
      view: "spec",
      class: spread.player_class,
      spec: spread.player_spec ?? "",
      sub_spec: spread.player_sub_spec ?? "",
    })
  // Drop the whole selection; the next instance restores it from storage.
  const handleBack = () =>
    update(Object.fromEntries(["instance", "diff", "size", ...PARSING_SELECTION_PARAMS].map((key) => [key, ""])))

  if (!restored || (encountersLoading && bosses.length === 0)) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Mirrors the statistics encounter sidebar, with single-boss selection.
  const bossList = (
    <>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Encounters</h3>
      <div className="mt-3 space-y-4">
        {sections.map((section) => (
          <div key={section.kind}>
            <h4 className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {section.label}
            </h4>
            <div className="space-y-1">
              {section.names.map((name) => {
                const isSelected = name === boss
                const hasKills = recordedNames.has(name)
                const isSubdued = section.kind !== "boss" || !hasKills
                const EncounterIcon = hasKills ? CheckCircle : CircleDashed
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => update({ boss: name })}
                    title={`${name}${hasKills ? "" : " (no kills yet)"}`}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-all duration-150",
                      isSelected
                        ? "border-l-3 border-l-primary-foreground/70 bg-primary-darker text-primary-foreground shadow-sm"
                        : "hover:translate-x-0.5 hover:bg-accent/50",
                      !isSelected && isSubdued && "text-muted-foreground",
                    )}
                  >
                    <EncounterIcon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        hasKills ? (isSubdued ? "text-green-500/60" : "text-green-500") : "text-muted-foreground/50",
                      )}
                    />
                    <span className="flex-1 truncate">{name}</span>
                    {!hasKills && <span className="shrink-0 text-[10px] text-muted-foreground/60">No kills</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  )

  return (
    <div className="flex">
      {!isMobile && (
        <div className="pt-1 w-64 shrink-0 border-r pr-4 overflow-y-auto styled-scrollbar sticky top-4 max-h-[calc(100vh-2rem)]">
          {bossList}
        </div>
      )}

      <div className={cn("min-w-0 flex-1 space-y-4 sm:space-y-5", !isMobile && "pl-6")}>
        <div className="relative overflow-hidden rounded-xl border">
          <div className="absolute inset-0 z-0">
            <img src={getInstanceBackground(instanceName)} alt="" className="h-full w-full object-cover opacity-45 sm:opacity-70" />
            <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/75 to-background/95 sm:bg-gradient-to-r sm:from-background/90 sm:via-background/70 sm:to-background/50" />
          </div>
          <div className="relative z-10 flex flex-col gap-3 p-3 sm:flex-row sm:items-end sm:justify-between sm:p-4">
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Instances
              </button>
              <h1 className="flex flex-wrap items-baseline gap-x-2 text-xl font-bold leading-tight sm:text-2xl">
                <span>{instanceName}</span>
                {difficulty && difficultyLabel(difficulty.difficultyName, difficulty.maxPlayers) && (
                  <span className="text-sm font-normal text-muted-foreground sm:text-lg">
                    {difficultyLabel(difficulty.difficultyName, difficulty.maxPlayers)}
                  </span>
                )}
              </h1>
              <p className="text-xs text-muted-foreground">
                What each parse takes, from every eligible kill in the last 60 days.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {isMobile && (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 min-w-0 justify-between gap-1.5 px-2 text-xs">
                        <span className="truncate">{boss || "Choose boss"}</span>
                        <ChevronDown className="h-3 w-3 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="styled-scrollbar max-h-[60vh] overflow-y-auto">
                      <DropdownMenuRadioGroup value={boss} onValueChange={(value) => update({ boss: value })}>
                        {bosses.map((name) => (
                          <DropdownMenuRadioItem key={name} value={name}>{name}</DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Segmented
                  value={metric}
                  options={[
                    { value: "dps", label: "DPS" },
                    { value: "hps", label: "HPS" },
                  ]}
                  onChange={setMetric}
                />
                {difficulties.length > 1 && difficulty && (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2 text-xs sm:h-7 sm:px-3">
                        {difficultyLabel(difficulty.difficultyName, difficulty.maxPlayers) || "Standard"}
                        <ChevronDown className="h-3 w-3 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuRadioGroup
                        value={difficulty.key}
                        onValueChange={(value) => {
                          const option = difficulties.find((o) => o.key === value)
                          if (option) update({ diff: option.difficultyName, size: String(option.maxPlayers) })
                        }}
                      >
                        {difficulties.map((option) => (
                          <DropdownMenuRadioItem key={option.key} value={option.key}>
                            {difficultyLabel(option.difficultyName, option.maxPlayers) || "Standard"}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
            <Segmented
              value={view}
              options={[
                { value: "spreads", label: "All specs", icon: <BarChart3 className="h-3.5 w-3.5" /> },
                { value: "spec", label: "Spec details", icon: <UserRound className="h-3.5 w-3.5" /> },
              ]}
              onChange={setView}
            />
          </div>
        </div>

        {bossQuery.data && !bossQuery.data.available ? (
          <p className="rounded-xl border bg-card py-10 text-center text-sm text-muted-foreground">
            Player parses are disabled for this server.
          </p>
        ) : bossQuery.isError ? (
          <p className="rounded-xl border bg-card py-10 text-center text-sm text-muted-foreground">Couldn't load parses.</p>
        ) : view === "spreads" ? (
          <SpreadsView
            spreads={bossSpreads}
            hidden={hidden}
            metricLabel={metricLabel}
            loading={bossQuery.isLoading}
            showOffRole={params.get("offrole") === "show"}
            onShowOffRoleChange={(show) => update({ offrole: show ? "show" : "" })}
            onHiddenChange={(hide) => update({ hide })}
            onOpenSpec={openSpec}
          />
        ) : (
          <SpecView
            instanceName={instanceName}
            bosses={bosses}
            boss={boss}
            bossSpreads={bossSpreads}
            metric={metric}
            difficulty={difficulty}
            cohortMode={cohortMode}
            playerClass={params.get("class") ?? ""}
            playerSpec={params.get("spec") ?? ""}
            playerSubSpec={params.get("sub_spec") ?? ""}
            onSelectBoss={(name) => update({ boss: name })}
            onSelectSpec={(changes) => update(changes)}
          />
        )}
      </div>
    </div>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string; icon?: React.ReactNode }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="flex w-fit items-center rounded-lg border border-white/10 bg-black/30 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === option.value ? "bg-[#5F8FA6] text-white" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  )
}
