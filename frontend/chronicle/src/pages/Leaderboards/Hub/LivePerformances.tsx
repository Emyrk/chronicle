import { useState } from "react"
import { useRankingsLeaderboard } from "@/api/rankingsQueries"
import { CLASS_DISPLAY } from "@/pages/Rankings/classDisplay"
import { RankingsTable, type RankedEntry } from "@/pages/Rankings/RankingsTable"
import type { EncounterSelection } from "./encounterSelection"

const PAGE_SIZE = 50

/** The shell owns every filter; this body only owns its page number. */
export interface LivePerformancesProps {
  instanceName: string
  selection: EncounterSelection
  cls?: string
  spec?: string
  subSpec?: string
  role: "dps" | "healing"
  realmName?: string
}

export function LivePerformances(props: LivePerformancesProps) {
  // Remount on a filter change so a previous page can never appear under a new scope.
  const scopeKey = JSON.stringify([
    props.instanceName, props.selection, props.cls, props.spec, props.subSpec, props.role, props.realmName,
  ])
  return <PerformancePage key={scopeKey} {...props} />
}

function PerformancePage({ instanceName, selection, cls, spec, subSpec, role, realmName }: LivePerformancesProps) {
  const [page, setPage] = useState(0)
  const boss = selection.kind === "bosses" && selection.bosses.length === 1
    ? selection.bosses[0]
    : undefined
  const ready = !!instanceName && !!boss
  const metric = role === "healing" ? "hps" : "dps"
  const { data, isLoading, isError, error, refetch, isFetching } = useRankingsLeaderboard({
    instance_names: instanceName,
    encounter_names: boss,
    class: cls,
    spec,
    sub_spec: subSpec,
    role: role === "healing" ? "heal" : "dps",
    realm_names: realmName,
    metric,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }, ready)

  if (!ready) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        Select exactly one boss to see live performances. Full clears and combined boss selections are not available on this leaderboard.
      </div>
    )
  }

  const entries: RankedEntry[] = (data?.entries ?? []).map((entry, index) => ({
    ...entry,
    rank: page * PAGE_SIZE + index + 1,
  }))
  const total = data?.total_count ?? 0
  const who = spec
    ? `${subSpec ? `${spec} (${subSpec})` : spec} ${CLASS_DISPLAY[cls ?? ""] ?? cls ?? ""}`
    : cls ? CLASS_DISPLAY[cls] ?? cls : "All players"

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold">Best {metric.toUpperCase()} · {boss}</h2>
        <span className="text-xs text-muted-foreground">{who} · one kill each</span>
      </div>
      {isError ? (
        <div role="alert" className="rounded-xl border bg-card p-8 text-center text-sm">
          <p>Could not load performances{error instanceof Error ? `: ${error.message}` : "."}</p>
          <button type="button" className="mt-3 cursor-pointer text-primary hover:underline" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <RankingsTable entries={entries} metric={metric} loading={isLoading || (isFetching && !data)} />
          {!isLoading && data && total > 0 && (
            <nav aria-label="Performances pages" className="flex items-center justify-between gap-3 text-sm">
              <button type="button" disabled={page === 0 || isFetching} onClick={() => setPage(page - 1)} className="cursor-pointer text-primary disabled:cursor-not-allowed disabled:opacity-50">
                Previous page
              </button>
              <span className="text-muted-foreground">{page * PAGE_SIZE + 1}–{page * PAGE_SIZE + entries.length} of {total}</span>
              <button type="button" disabled={(page + 1) * PAGE_SIZE >= total || isFetching} onClick={() => setPage(page + 1)} className="cursor-pointer text-primary disabled:cursor-not-allowed disabled:opacity-50">
                Next page
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  )
}
