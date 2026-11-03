import { useQuery } from "@tanstack/react-query"
import { ArrowUpRight, BarChart3, Gauge, Medal, ScrollText, Swords, Timer } from "lucide-react"
import { useRankingsInstances, useRankingsLeaderboard } from "@/api/rankingsQueries"
import { CLASS_CSS_VAR } from "@/pages/Rankings/classDisplay"
import { fetchLiveRatingPage, liveRatingURL, type LiveRatingCohort } from "@/pages/Leaderboards/Ratings/liveRatingAdapter"
import type { EncounterSelection } from "./encounterSelection"
import type { HubTab } from "./hubTabs"

export interface LiveOverviewProps {
  instanceName: string
  selection: EncounterSelection
  role: "dps" | "healing"
  subject: "player" | "guild"
  cls?: string
  spec?: string
  subSpec?: string
  /** Performance API accepts a realm name. Do not derive one from rating realm IDs. */
  realmName?: string
  /** Published rating boards filter displayed rows by realm, without reranking them. */
  realmIDs?: readonly string[]
  /** An explicitly chosen difficulty, raid size and (for players) class/spec/performance cohort. */
  ratingCohort?: LiveRatingCohort
  /** A selected published raid population for the exact-boss performance preview. */
  performanceCohort?: { difficulty: string; maxPlayers: number }
  onOpenTab: (tab: HubTab) => void
}

/** A live raid dashboard. Each headline names its own population, not an invented cross-board winner. */
export function LiveOverview({ instanceName, selection, role, subject, cls, spec, subSpec, realmName, realmIDs, ratingCohort, performanceCohort, onOpenTab }: LiveOverviewProps) {
  const summaries = useRankingsInstances(!!instanceName)
  const raids = summaries.data?.filter((row) => row.category === "raid" && row.instance_name === instanceName) ?? []
  const raidReady = !summaries.isPending && !summaries.isError && raids.length > 0
  const boss = selection.kind === "bosses" && selection.bosses.length === 1 && selection.bosses[0].trim() ? selection.bosses[0] : undefined
  const combined = selection.kind === "bosses" && !boss
  const metric = role === "healing" ? "hps" : "dps"
  const exactPerformance = performanceCohort && !!performanceCohort.difficulty && Number.isInteger(performanceCohort.maxPlayers) && performanceCohort.maxPlayers > 0
    && raids.some((row) => row.difficulty_name === performanceCohort.difficulty && row.max_players === performanceCohort.maxPlayers)
  const performances = useRankingsLeaderboard({
    instance_names: instanceName, encounter_names: boss, class: cls, spec, sub_spec: subSpec,
    difficulty_names: performanceCohort?.difficulty, max_players: performanceCohort?.maxPlayers,
    role: role === "healing" ? "heal" : "dps", metric, realm_names: realmName, limit: 3,
  }, raidReady && !!boss && !!exactPerformance && subject === "player")

  // Renown is a published all-cohort metric. Other rating metrics need an exact
  // selected cohort, never a union of class/spec/raid-size populations.
  const ratingMetric = ratingCohort ? "peak" : "renown"
  const validRatingCohort = !ratingCohort || (
    raids.some((row) => row.difficulty_name === ratingCohort.difficulty && row.max_players === ratingCohort.maxPlayers)
    && (subject !== "player" || ((!cls || cls === ratingCohort.playerClass) && (!spec || spec === ratingCohort.spec)
      && (!subSpec || subSpec === ratingCohort.subSpec) && ratingCohort.performance === metric))
  )
  const ratingURL = !combined && raidReady && validRatingCohort ? liveRatingURL({
    instanceName, encounterName: boss, subject, metric: ratingMetric, window: "period",
    cohort: ratingCohort, realmIDs,
  }) : null
  const ratings = useQuery({
    queryKey: ["tenant-rating-overview", ratingURL],
    queryFn: () => fetchLiveRatingPage(ratingURL!),
    enabled: !!ratingURL,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  if (summaries.isPending) return <p role="status" className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">Loading raid overview…</p>
  if (summaries.isError) return <p role="alert" className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">Could not load raid overview.</p>
  if (!raids.length) return <p className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">No published raid data for {instanceName} yet. The Overview only covers raids.</p>

  return <div className="space-y-5">
    <header className="relative overflow-hidden rounded-xl border border-amber-400/20 bg-card px-5 py-6 sm:px-7 sm:py-8">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_90%_0%,rgba(194,138,53,.14),transparent_65%)]" />
      <div className="relative">
        <p className="text-[11px] font-semibold tracking-[.22em] text-amber-300/80 uppercase">Raid ledger / live records</p>
        <h2 className="font-wow mt-2 text-2xl leading-tight sm:text-3xl">{instanceName}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Published records only. Each board keeps its own cohort and ranking rules; the realm choice on ratings filters displayed entries, not rank positions.</p>
      </div>
      <div className="relative mt-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="Recorded raid cohorts">
        {raids.map((row) => <div key={`${row.difficulty_name}:${row.max_players}`} className="flex items-baseline justify-between gap-3 rounded-lg border border-white/10 bg-background/45 px-4 py-3">
          <span className="min-w-0 text-xs text-muted-foreground">{row.difficulty_name || "Default"} · {row.max_players} players</span>
          <span className="shrink-0 font-mono text-lg tabular-nums text-amber-200">{row.total_kills.toLocaleString()} <span className="text-[10px] text-muted-foreground">kills</span></span>
        </div>)}
      </div>
    </header>

    <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
      <OverviewCard title={ratingMetric === "peak" ? "Published Peak" : "Published Renown"} eyebrow="01 / Ratings" icon={Medal} onOpen={() => onOpenTab("ratings")} accent="text-amber-300" className="lg:row-span-2">
        {combined ? <Muted>Combined boss selections have no published rating board. Choose one boss or the full raid.</Muted>
          : !ratingURL ? <Muted>Choose an exact difficulty, raid size, class, spec and performance cohort for Peak ratings.</Muted>
          : ratings.isPending ? <State status>Loading published ratings…</State>
          : ratings.isError ? <State alert>Could not load published ratings.</State>
          : !ratings.data?.entries.length ? <Muted>No published scores for this board yet.</Muted>
          : <><ul className="divide-y divide-white/5 border-t border-white/10">
            {ratings.data.entries.slice(0, 3).map((entry) => {
              const player = "player_guid" in entry
              const name = player ? entry.player_name || entry.player_guid : "guild_id" in entry ? entry.guild_name || entry.guild_id : "Unknown guild"
              return <li key={`${entry.realm_id}-${player ? entry.player_guid : "guild_id" in entry ? entry.guild_id : name}`} className="flex items-center gap-3 py-3 text-sm">
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-amber-300/60" />
                <span className="min-w-0 flex-1 truncate font-medium" style={player ? { color: CLASS_CSS_VAR[entry.player_class] } : undefined}>{name}</span>
                <span className="shrink-0 font-mono tabular-nums text-amber-200">{ratingMetric === "renown" ? entry.score.toLocaleString() : entry.score.toFixed(1)}</span>
              </li>
            })}
          </ul><p className="pt-3 text-xs text-muted-foreground">{ratingMetric === "renown" ? "All published cohorts" : `${ratingCohort?.difficulty || "Default"} · ${ratingCohort?.maxPlayers} players · ${subject === "guild" ? "Guilds" : `${ratingCohort?.playerClass} / ${ratingCohort?.spec}${ratingCohort?.subSpec ? ` / ${ratingCohort.subSpec}` : ""} · ${ratingCohort?.performance?.toUpperCase()}`}`} · 180 days{realmIDs?.length ? " · realm display filter" : ""}</p></>}
      </OverviewCard>

      <OverviewCard title={`Best recorded ${metric.toUpperCase()}`} eyebrow="02 / Performances" icon={Swords} onOpen={() => onOpenTab("performances")} accent="text-sky-300">
        {subject === "guild" ? <Muted>Character performances are not available in guild view.</Muted>
          : !boss ? <Muted>Select exactly one boss for recorded {metric.toUpperCase()} performances. Full clears and combined bosses are not supported.</Muted>
          : !exactPerformance ? <Muted>Choose a published raid difficulty and size for an exact-boss performance preview. Unspecified difficulties cannot be isolated by this API.</Muted>
          : performances.isPending ? <State status>Loading performances…</State>
          : performances.isError ? <State alert>Could not load performances.</State>
          : !performances.data?.entries.length ? <Muted>No recorded performances for {boss} yet.</Muted>
          : <><p className="mb-2 text-xs text-muted-foreground">{boss} · {performanceCohort?.difficulty} · {performanceCohort?.maxPlayers} players · {realmName || "All realms"} · one kill each</p>
            <ol className="divide-y divide-white/5">{performances.data.entries.map((entry, index) => <li key={entry.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="w-5 font-mono text-xs text-muted-foreground">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate" style={{ color: CLASS_CSS_VAR[entry.player_class] }}>{entry.player_name}</span>
              <span className="font-mono tabular-nums text-sky-200">{entry[metric].toLocaleString()} {metric}</span>
            </li>)}</ol></>}
      </OverviewCard>
      <OverviewCard title="Speedruns" eyebrow="03 / Clear times" icon={Timer} onOpen={() => onOpenTab("speedruns")} accent="text-amber-300">
        <Muted>Explore qualified raid clear times and their recorded proof. Run timing is ranked separately from performances.</Muted>
      </OverviewCard>
      <OverviewCard title="Statistics" eyebrow="04 / Distributions" icon={BarChart3} onOpen={() => onOpenTab("statistics")} accent="text-emerald-300">
        <Muted>Compare recorded kills, spec distributions and encounter times in the full statistics board.</Muted>
      </OverviewCard>
      <OverviewCard title="Parsing" eyebrow="05 / Parse distributions" icon={Gauge} onOpen={() => onOpenTab("parsing")} accent="text-violet-300">
        <Muted>Examine parse spreads for the selected raid in the dedicated parsing view.</Muted>
      </OverviewCard>
    </div>
    <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground"><ScrollText className="size-3.5" /> Counts above are per published raid cohort; no totals are added across raid sizes or difficulties.</p>
  </div>
}

function OverviewCard({ title, eyebrow, icon: Icon, onOpen, accent, className, children }: {
  title: string; eyebrow: string; icon: typeof Medal; onOpen: () => void; accent: string; className?: string; children: React.ReactNode
}) {
  return <section className={`relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card px-5 py-5 sm:px-6 ${className ?? ""}`}>
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-amber-300/50 via-white/10 to-transparent" />
    <p className="text-[10px] font-semibold tracking-[.2em] text-muted-foreground uppercase">{eyebrow}</p>
    <div className="mt-2 flex items-center gap-2"><Icon aria-hidden className={`size-5 ${accent}`} /><h3 className="font-wow text-xl">{title}</h3></div>
    <div className="min-h-20 flex-1 pt-4">{children}</div>
    <button type="button" onClick={onOpen} className="mt-3 inline-flex cursor-pointer items-center gap-1 self-start rounded-sm text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
      Explore {title} <ArrowUpRight aria-hidden className="size-3.5" />
    </button>
  </section>
}

function Muted({ children }: { children: React.ReactNode }) { return <p className="text-sm leading-relaxed text-muted-foreground">{children}</p> }
function State({ children, alert, status }: { children: React.ReactNode; alert?: boolean; status?: boolean }) {
  return <p role={alert ? "alert" : status ? "status" : undefined} className="text-sm text-muted-foreground">{children}</p>
}
