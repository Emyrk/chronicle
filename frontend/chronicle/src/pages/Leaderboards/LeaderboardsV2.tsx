import { useState } from "react"
import { useInfiniteQuery } from "@tanstack/react-query"
import { Link, Navigate, useSearchParams } from "react-router-dom"
import { ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { AdRailStack } from "@/components/Ads/AdRailStack"
import { useRankingsEncounters, useRankingsFilters, useRankingsInstances } from "@/api/rankingsQueries"
import { useRealms } from "@/api/queries"
import type { RankingsInstanceSummary } from "@/api/typesGenerated"
import { InstanceCard } from "../Rankings/InstanceCard"
import { getInstanceBackground } from "../Logs/utils/instanceImages"
import { InstanceView } from "../Rankings/InstanceView"
import { ParsingInstanceView } from "./Parsing/ParsingInstanceView"
import { RulesetInstanceView } from "./RulesetInstanceView"
import { RulesetsLanding } from "./RulesetsLanding"
import { SpeedrunLeaderboard } from "../Leaderboard/SpeedrunLeaderboard"
import { LivePerformances } from "./Hub/LivePerformances"
import { TABS } from "./Hub/hubTabs"
import { hubParams, v2Selection } from "./v2Selection"
import { legacyLeaderboardsTarget } from "./leaderboardsState"
import { ratingScopeURL, fetchLiveRating, type LiveRatingRequest } from "./ratingsLive"

export function LeaderboardsV2() {
  const [params, setParams] = useSearchParams()
  const { tab, instance, realmIDs, encounter } = v2Selection(params)
  const select = (key: "tab" | "instance" | "realm_ids" | "encounter", value?: string) => setParams(hubParams(params, key, value))
  // Preserve historical deep links while the classic pages live under their own paths.
  if (params.get("tab") === "speedrun" || params.get("tab") === "leaderboard") return <Navigate to={legacyLeaderboardsTarget(params)} replace />
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-[1920px] space-y-5 px-3 py-6 sm:px-6">
        <header className="relative overflow-hidden rounded-xl border bg-card">
          {instance && <><img src={getInstanceBackground(instance)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" /><div className="absolute inset-0 bg-gradient-to-t from-card via-card/80 to-card/30" /></>}
          <div className="relative px-5 pt-8 pb-5 sm:px-6 sm:pt-10">
            {instance && <button type="button" className="mb-2 flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground" onClick={() => select("instance")}> <ChevronLeft className="size-4" /> All instances</button>}
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Leaderboards / {instance ? "Instance" : "All instances"}</p>
            <h1 className="font-wow mt-1 text-3xl leading-tight sm:text-4xl">{instance ?? "All instances"}</h1>
            <p className="mt-2 text-sm text-muted-foreground">Published instance rankings. Choose an instance to explore ratings, performances, clear times and more.</p>
            {(tab === "ratings" || tab === "performances") && <RatingsRealmPicker selected={realmIDs} multiple={tab === "ratings"} onChange={(ids) => select("realm_ids", ids.join(","))} />}
          </div>
          <nav aria-label="Leaderboard section" className="styled-scrollbar relative flex overflow-x-auto border-t border-white/5 px-2 sm:px-4">
            {TABS.map(({ id, icon: Icon, label }) => (
              <button key={id} type="button" aria-pressed={tab === id} onClick={() => select("tab", id)}
                className={cn("flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors sm:px-4", tab === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground")}>
                <Icon className={cn("size-4", tab === id && "text-primary")} />{label}
              </button>
            ))}
          </nav>
        </header>
        <nav aria-label="Classic leaderboard pages" className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs text-muted-foreground">
          <span>Classic boards:</span>
          <Link className="hover:text-foreground hover:underline" to={`/leaderboards/statistics${instance ? `?instance=${encodeURIComponent(instance)}` : ""}`}>Statistics</Link>
          <Link className="hover:text-foreground hover:underline" to={`/leaderboards/speedruns${instance ? `?instance=${encodeURIComponent(instance)}` : ""}`}>Speedruns</Link>
          <Link className="hover:text-foreground hover:underline" to={`/leaderboards/parsing${instance ? `?instance=${encodeURIComponent(instance)}` : ""}`}>Parsing</Link>
          <Link className="hover:text-foreground hover:underline" to="/leaderboards/rulesets">Rulesets</Link>
          {instance && <Link className="hover:text-foreground hover:underline" to={`/leaderboards/ruleset?instance=${encodeURIComponent(instance)}`}>Instance ruleset</Link>}
        </nav>
        <div className="flex gap-6">
          <div className="min-w-0 flex-1">
        {instance ? (
          tab === "ratings" ? <LiveRatings instance={instance} realmIDs={realmIDs} /> :
          tab === "statistics" || tab === "overview" ? <InstanceView instanceName={instance} /> :
          tab === "performances" ? <LivePerformancesPanel instanceName={instance} encounter={encounter} realmIDs={realmIDs} onEncounter={(boss) => select("encounter", boss)} /> :
          tab === "parsing" ? <ParsingInstanceView key={instance} instanceName={instance} /> :
          tab === "speedruns" ? <SpeedrunLeaderboard overrideInstance={instance} /> :
          <RulesetInstanceView instanceName={instance} />
        ) : tab === "rulesets" ? <div onClickCapture={(event) => {
            const link = (event.target as HTMLElement).closest("a")
            const name = link && new URL(link.href).searchParams.get("instance")
            if (name) { event.preventDefault(); select("instance", name) }
          }}><RulesetsLanding /></div> : <LiveInstanceGrid params={params} />}
          </div>
          <AdRailStack primaryPlacement="leaderboards-right-rail" secondaryPlacement="leaderboards-right-rail-lower" />
        </div>
      </main>
    </div>
  )
}

function LivePerformancesPanel({ instanceName, encounter, realmIDs, onEncounter }: {
  instanceName: string
  encounter: string | null
  realmIDs: string[]
  onEncounter: (boss?: string) => void
}) {
  const bosses = useRankingsEncounters(instanceName)
  const realms = useRealms()
  const [role, setRole] = useState<"dps" | "healing">("dps")
  const selectedBoss = bosses.data?.some((row) => row.encounter_name === encounter) ? encounter : null
  const realmName = realmIDs.length === 1 ? realms.data?.find((realm) => realm.id === realmIDs[0])?.name : undefined
  if (bosses.isPending) return <p role="status">Loading encounters…</p>
  if (bosses.isError) return <p role="alert">Could not load encounters.</p>
  return <section className="space-y-5">
    <div className="flex flex-wrap gap-3 rounded-xl border bg-card p-4 text-sm">
      <label>Encounter <select aria-label="Performance encounter" className="ml-2 rounded border bg-background p-2" value={selectedBoss ?? ""} onChange={(e) => onEncounter(e.target.value || undefined)}>
        <option value="">Select a boss</option>
        {bosses.data?.map((row) => <option key={row.encounter_name} value={row.encounter_name}>{row.encounter_name}</option>)}
      </select></label>
      <label>Role <select aria-label="Performance role" className="ml-2 rounded border bg-background p-2" value={role} onChange={(e) => setRole(e.target.value as "dps" | "healing")}>
        <option value="dps">DPS</option><option value="healing">Healing</option>
      </select></label>
    </div>
    {!selectedBoss ? <p className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">{bosses.data?.length ? "Select a boss for exact-kill performances." : "No published encounters for this instance yet."}</p> :
      <LivePerformances instanceName={instanceName} selection={{ kind: "bosses", bosses: [selectedBoss] }} role={role} realmName={realmName} />}
  </section>
}

function RatingsRealmPicker({ selected, multiple, onChange }: { selected: string[]; multiple: boolean; onChange: (ids: string[]) => void }) {
  const realms = useRealms()
  const valid = selected.filter((id) => realms.data?.some((realm) => realm.id === id))
  const active = multiple || valid.length <= 1 ? valid : []
  return <details className="relative mt-4 inline-block rounded-md border bg-background/80 px-3 py-2 text-sm backdrop-blur-sm">
    <summary className="cursor-pointer">{multiple ? "Ratings realms" : "Performance realm"}: {active.length ? active.map((id) => realms.data?.find((realm) => realm.id === id)?.name).join(", ") : "All realms"}</summary>
    <div className="styled-scrollbar absolute left-0 top-full z-20 mt-1 max-h-52 min-w-48 overflow-y-auto rounded border bg-background p-2 shadow-lg">
      {realms.isPending ? <span role="status">Loading realms…</span> : realms.isError ? <span role="alert">Could not load realms.</span> : <>
        <button type="button" className="block w-full p-1 text-left underline" onClick={() => onChange([])}>All realms</button>
        {realms.data?.map((realm) => <label key={realm.id} className="flex items-center gap-2 p-1">
          <input type="checkbox" checked={active.includes(realm.id)} onChange={() => onChange(active.includes(realm.id) ? active.filter((id) => id !== realm.id) : multiple ? [...active, realm.id] : [realm.id])} />
          {realm.name}
        </label>)}
      </>}
    </div>
  </details>
}

function LiveInstanceGrid({ params }: { params: URLSearchParams }) {
  const { data, isPending, isError } = useRankingsInstances()
  if (isPending) return <p role="status">Loading instances…</p>
  if (isError) return <p role="alert">Could not load instances.</p>
  if (!data?.length) return <p>No published instances yet.</p>
  return <div className="space-y-7">{(["raid", "dungeon", "other"] as const).map((category) => {
    const rows = data.filter((row) => category === "other" ? row.category !== "raid" && row.category !== "dungeon" : row.category === category)
    if (!rows.length) return null
    return <section key={category} className="space-y-4">
      <h2 className="font-wow text-xl">{category === "raid" ? "Raids" : category === "dungeon" ? "Dungeons" : "Other instances"}</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{rows.map((row: RankingsInstanceSummary) => (
        <InstanceCard key={`${row.instance_name}-${row.difficulty_name}-${row.max_players}`} name={row.instance_name} to={`?${hubParams(params, "instance", row.instance_name)}`} badge={row.difficulty_name}>
          <p className="text-xs text-muted-foreground">{row.total_kills.toLocaleString()} recorded kills · {row.max_players} players</p>
        </InstanceCard>
      ))}</div>
    </section>
  })}</div>
}

function LiveRatings({ instance, realmIDs }: { instance: string | null; realmIDs: string[] }) {
  const realms = useRealms()
  const selectedRealmIDs = realmIDs.filter((id) => realms.data?.some((realm) => realm.id === id))
  const summaries = useRankingsInstances()
  const filters = useRankingsFilters(instance ?? undefined)
  const [metric, setMetric] = useState<LiveRatingRequest["metric"]>("renown")
  const [window, setWindow] = useState<LiveRatingRequest["window"]>("period")
  const [performance, setPerformance] = useState<"dps" | "hps">("dps")
  const [cohortKey, setCohortKey] = useState("")
  // A raid summary supplies the exact difficulty/size. Do not infer a global cohort from a random raid.
  const cohorts = (summaries.data ?? []).filter((s) => instance && s.instance_name === instance)
  const cohort = cohorts.find((s) => `${s.instance_name}|${s.difficulty_name}|${s.max_players}` === cohortKey) ?? cohorts[0]
  const [className, setClassName] = useState("")
  const [specName, setSpecName] = useState("")
  const [subSpec, setSubSpec] = useState("")
  const cls = filters.data?.find((f) => f.player_class === className) ?? filters.data?.[0]
  const spec = cls?.specs.find((s) => s.spec === specName) ?? cls?.specs[0]
  const selectedSubSpec = spec?.sub_specs.includes(subSpec) ? subSpec : spec?.sub_specs[0] ?? ""
  const request: LiveRatingRequest = {
    realmIDs: selectedRealmIDs, instanceName: instance ?? undefined, metric, window,
    cohort: metric === "renown" ? undefined : cohort && cls && spec ? {
      difficulty: cohort.difficulty_name, maxPlayers: cohort.max_players,
      playerClass: cls.player_class, spec: spec.spec, subSpec: selectedSubSpec, performance,
    } : undefined,
  }
  const url = ratingScopeURL(request)
  const ratings = useInfiniteQuery({
    queryKey: ["rankings", "ratings", url],
    queryFn: ({ pageParam }) => fetchLiveRating(url!, pageParam || undefined),
    initialPageParam: "",
    getNextPageParam: (page) => page.next_cursor || undefined,
    enabled: !!url && realms.isSuccess,
    retry: false,
  })
  const entries = ratings.data?.pages.flatMap((page) => page.entries) ?? []
  if (realms.isPending || (metric !== "renown" && (summaries.isPending || filters.isPending))) return <p role="status">Loading rating cohorts…</p>
  if (realms.isError || (metric !== "renown" && (summaries.isError || filters.isError))) return <p role="alert">Could not load rating cohorts. Please try again later.</p>
  return <section className="space-y-5 rounded-xl border bg-card p-5">
    <div className="flex flex-wrap gap-3">
      <label>Rating <select aria-label="Rating metric" className="ml-2 rounded border bg-background p-2" value={metric} onChange={(e) => { setMetric(e.target.value as LiveRatingRequest["metric"]); setWindow("period") }}>
        <option value="renown">Renown</option><option value="peak">Peak</option><option value="mastery">Mastery</option><option value="ranked_mastery">Ranked Mastery</option>
      </select></label>
      <label>Window <select aria-label="Rating window" className="ml-2 rounded border bg-background p-2" value={window} onChange={(e) => setWindow(e.target.value as LiveRatingRequest["window"])}>
        <option value="period">Period</option>{metric === "renown" ? <option value="career">Career</option> : <option value="all_time">All time</option>}
      </select></label>
    </div>
    {metric !== "renown" && <div className="flex flex-wrap gap-3">
      <label>Raid cohort <select aria-label="Raid cohort" className="ml-2 rounded border bg-background p-2" value={cohort ? `${cohort.instance_name}|${cohort.difficulty_name}|${cohort.max_players}` : ""} onChange={(e) => setCohortKey(e.target.value)}>
        {cohorts.map((c) => <option key={`${c.instance_name}|${c.difficulty_name}|${c.max_players}`} value={`${c.instance_name}|${c.difficulty_name}|${c.max_players}`}>{c.instance_name} · {c.difficulty_name || "Default"} · {c.max_players} players</option>)}
      </select></label>
      <label>Class <select aria-label="Class" className="ml-2 rounded border bg-background p-2" value={cls?.player_class ?? ""} onChange={(e) => { setClassName(e.target.value); setSpecName(""); setSubSpec("") }}>
        {filters.data?.map((c) => <option key={c.player_class} value={c.player_class}>{c.player_class}</option>)}
      </select></label>
      <label>Spec <select aria-label="Spec" className="ml-2 rounded border bg-background p-2" value={spec?.spec ?? ""} onChange={(e) => { setSpecName(e.target.value); setSubSpec("") }}>
        {cls?.specs.map((s) => <option key={s.spec} value={s.spec}>{s.spec || "Unspecified"}</option>)}
      </select></label>
      <label>Sub-spec <select aria-label="Sub-spec" className="ml-2 rounded border bg-background p-2" value={selectedSubSpec} onChange={(e) => setSubSpec(e.target.value)}>
        {(spec?.sub_specs.length ? spec.sub_specs : [""]).map((s) => <option key={s} value={s}>{s || "Unspecified"}</option>)}
      </select></label>
      <label>Performance <select aria-label="Performance metric" className="ml-2 rounded border bg-background p-2" value={performance} onChange={(e) => setPerformance(e.target.value as "dps" | "hps")}>
        <option value="dps">DPS</option><option value="hps">HPS</option>
      </select></label>
    </div>}
    <p className="text-sm text-muted-foreground">{metric === "renown" ? "Renown has no class or spec cohort." : "Scores compare only the selected class, spec, performance metric and raid size."} Realm selection filters displayed entries without recomputing scores. Character names are not included in the published response; IDs are shown instead.</p>
    {!url ? <p>{!instance ? "Select an instance from the Overview tab to view a raid rating board." : "No supported rating cohort is available for this selection."}</p> : ratings.isPending ? <p role="status">Loading ratings…</p> : ratings.isError && !entries.length ? <p role="alert">Could not load published ratings. <button type="button" className="underline" onClick={() => void ratings.refetch()}>Retry</button></p> : !entries.length ? <p>No published scores in this cohort yet.</p> : <>
      <ul className="divide-y">{entries.map((entry, index) => <li key={`${entry.realm_id}-${entry.player_guid}-${index}`} className="flex flex-wrap items-center gap-3 py-3 text-sm">
        <span className="font-mono text-xs">{entry.player_guid}</span>
        <span className="text-muted-foreground">{entry.player_class ? `${entry.player_class} · ${entry.player_spec} · ` : ""}{entry.instance_name} · {realms.data?.find((realm) => realm.id === entry.realm_id)?.name ?? entry.realm_id}</span>
        <strong className="ml-auto tabular-nums">{entry.score.toLocaleString()}</strong>
      </li>)}</ul>
      {ratings.isError && <p role="alert">Could not load more ratings. <button type="button" className="underline" onClick={() => void ratings.fetchNextPage()}>Retry</button></p>}
      {ratings.hasNextPage && !ratings.isError && <button type="button" disabled={ratings.isFetchingNextPage} className="rounded border px-3 py-2 text-sm disabled:opacity-50" onClick={() => void ratings.fetchNextPage()}>{ratings.isFetchingNextPage ? "Loading…" : "Load more"}</button>}
    </>}
    <Link to="/leaderboards/statistics" className="text-xs text-muted-foreground underline">Current leaderboards</Link>
  </section>
}
