import { useMemo } from "react"
import { useParseScoreCohort, useParseScoreSpreads } from "@/api/rankingsQueries"
import type { ParseScoreSpread } from "@/api/typesGenerated"
import { cn } from "@/lib/utils"
import { parseHexColor } from "@/pages/Instance/parseColors"
import { CohortSummaryStrip } from "@/pages/Parsing/cohort/CohortChrome"
import { CohortDistribution } from "@/pages/Parsing/cohort/CohortDistribution"
import { formatMetric, summarizeCohort, tierCutoffs } from "@/pages/Parsing/cohort/cohortStats"
import { selectPlayerSubSpec } from "@/pages/Parsing/cohort/playerCohortState"
import { CLASS_CSS_VAR, CLASS_DISPLAY } from "@/pages/Rankings/classDisplay"
import { ClassSpecFilter } from "@/pages/Rankings/ClassSpecFilter"
import type { ParsingMetric } from "./parsingState"
import { classSpecOptions, spreadCutoff, type SpreadDifficultyOption } from "./spreadBands"

const TABLE_FLOORS = [25, 50, 75, 95, 99, 100] as const

/**
 * One class/spec in depth: the selected boss's full parse histogram, plus
 * the cutoffs for every boss in the instance.
 */
export function SpecView({
  instanceName,
  bosses,
  boss,
  bossSpreads,
  metric,
  difficulty,
  cohortMode,
  playerClass,
  playerSpec,
  playerSubSpec,
  onSelectBoss,
  onSelectSpec,
}: {
  instanceName: string
  bosses: readonly string[]
  boss: string
  /** All specs on the selected boss; supplies the class/spec choices. */
  bossSpreads: readonly ParseScoreSpread[]
  metric: ParsingMetric
  difficulty: SpreadDifficultyOption | undefined
  cohortMode: string
  playerClass: string
  playerSpec: string
  playerSubSpec: string
  onSelectBoss: (boss: string) => void
  onSelectSpec: (changes: { class?: string; spec?: string; sub_spec?: string }) => void
}) {
  const metricLabel = metric.toUpperCase()
  const specMode = cohortMode === "spec"
  const ready = !!playerClass && (!specMode || !!playerSpec)

  const instanceSpreadsQuery = useParseScoreSpreads(
    { metric, encounterNames: bosses, playerClass, playerSpec: specMode ? playerSpec : "" },
    ready,
  )
  const instanceSpreads = useMemo(
    () =>
      (ready ? (instanceSpreadsQuery.data?.spreads ?? []) : []).filter(
        (spread) =>
          !!difficulty &&
          spread.difficulty_name === difficulty.difficultyName &&
          spread.max_players === difficulty.maxPlayers,
      ),
    [instanceSpreadsQuery.data, ready, difficulty],
  )
  // Sub-spec cohorts are exact; fall back to one that has kills here.
  const subSpec = selectPlayerSubSpec(
    instanceSpreads.filter((s) => s.encounter_name === boss).map((s) => s.player_sub_spec ?? ""),
    playerSubSpec,
  ).selected
  const spreadByBoss = useMemo(
    () => new Map(instanceSpreads.filter((s) => (s.player_sub_spec ?? "") === subSpec).map((s) => [s.encounter_name, s])),
    [instanceSpreads, subSpec],
  )

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const cohortQuery = useParseScoreCohort({
    date: today,
    period: "60d",
    metric,
    encounterName: ready && spreadByBoss.has(boss) ? boss : "",
    playerClass,
    playerSpec: specMode ? playerSpec : "",
    playerSubSpec: specMode ? subSpec : "",
    difficulty: difficulty?.difficultyName ?? "",
    maxPlayers: difficulty?.maxPlayers,
    cohortMode,
  })
  const entries = useMemo(() => cohortQuery.data?.entries ?? [], [cohortQuery.data])
  const scored = useMemo(() => entries.map((e) => ({ value: e.metric_value, score: e.display_score })), [entries])
  const summary = useMemo(() => summarizeCohort(entries.map((e) => e.metric_value), "higher"), [entries])
  const cutoffs = useMemo(() => tierCutoffs(scored, "higher"), [scored])

  const options = useMemo(() => classSpecOptions(bossSpreads), [bossSpreads])
  const classColor = CLASS_CSS_VAR[playerClass]
  const specTitle = [subSpec ? `${playerSpec} (${subSpec})` : playerSpec, CLASS_DISPLAY[playerClass] ?? playerClass]
    .filter(Boolean)
    .join(" ")

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-3 sm:p-4">
        <ClassSpecFilter
          selectedClass={playerClass || null}
          selectedSpec={playerSpec || null}
          selectedSubSpec={subSpec || null}
          options={options}
          onClassSelect={(cls) => onSelectSpec({ class: cls ?? "", spec: "", sub_spec: "" })}
          onSpecSelect={(spec) => onSelectSpec({ spec: spec ?? "", sub_spec: "" })}
          onSubSpecSelect={(value) => onSelectSpec({ sub_spec: value ?? "" })}
        />
      </div>

      {!ready ? (
        <p className="rounded-xl border bg-card py-10 text-center text-sm text-muted-foreground">
          Pick a class{specMode ? " and spec" : ""} to see what each parse takes on every {instanceName} boss.
        </p>
      ) : (
        <>
          <section className="space-y-3 rounded-xl border bg-card p-3 sm:p-5">
            <h2 className="text-sm font-medium text-muted-foreground">
              <span style={{ color: classColor }}>{specTitle}</span> on {boss}
            </h2>
            {!spreadByBoss.has(boss) ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {instanceSpreadsQuery.isLoading ? "Loading…" : `No ${specTitle} kills on ${boss} in the last 60 days.`}
              </p>
            ) : cohortQuery.isError ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Couldn't load this cohort.</p>
            ) : !summary ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className={cn("space-y-3 transition-opacity", cohortQuery.isPlaceholderData && "opacity-60")}>
                <CohortSummaryStrip
                  summary={summary}
                  cutoffs={cutoffs}
                  formatValue={formatMetric}
                  sampleLabel="Kills"
                  bestLabel={`Top ${metricLabel}`}
                  worstLabel={`Lowest ${metricLabel}`}
                  status={cohortQuery.data?.status}
                />
                <CohortDistribution
                  values={scored}
                  time={false}
                  direction="higher"
                  formatValue={formatMetric}
                  formatTick={(value) => Math.round(value).toLocaleString("en-US")}
                  unitLabel="kills"
                />
              </div>
            )}
          </section>

          <section className="rounded-xl border bg-card p-3 sm:p-5">
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              {metricLabel} needed for each parse across {instanceName}
            </h2>
            <div className="styled-scrollbar overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-3 text-left font-medium">Boss</th>
                    <th className="px-2 py-2 text-right font-medium">Kills</th>
                    {TABLE_FLOORS.map((floor) => (
                      <th key={floor} className="px-2 py-2 text-right font-medium">
                        <span className="inline-flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: parseHexColor(floor) }} />
                          {floor === 100 ? "100" : `${floor}+`}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bosses.map((name) => {
                    const spread = spreadByBoss.get(name)
                    const cell = (floor: number) => {
                      const value = spread ? spreadCutoff(spread, floor) : null
                      return value === null ? "—" : formatMetric(value)
                    }
                    return (
                      <tr
                        key={name}
                        onClick={() => onSelectBoss(name)}
                        className={cn(
                          "cursor-pointer border-b border-border/40 transition-colors hover:bg-muted/20",
                          name === boss && "bg-primary/10",
                          !spread && "text-muted-foreground",
                        )}
                      >
                        <td className="py-2 pr-3 font-medium">{name}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                          {spread ? spread.sample_size.toLocaleString() : "—"}
                        </td>
                        {TABLE_FLOORS.map((floor) => (
                          <td key={floor} className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                            {cell(floor)}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
