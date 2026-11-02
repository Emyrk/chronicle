import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useSearchParams } from "react-router-dom"
import { ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { useRankingsFilters, useRankingsInstances } from "@/api/rankingsQueries"
import type { RatingRealmGroupsResponse, RankingsInstanceSummary } from "@/api/typesGenerated"
import { InstanceCard } from "../Rankings/InstanceCard"
import { getInstanceBackground } from "../Logs/utils/instanceImages"
import { InstanceView } from "../Rankings/InstanceView"
import { ParsingInstanceView } from "./Parsing/ParsingInstanceView"
import { RulesetInstanceView } from "./RulesetInstanceView"
import { RulesetsLanding } from "./RulesetsLanding"
import { SpeedrunLeaderboard } from "../Leaderboard/SpeedrunLeaderboard"
import { RankingsLanding } from "../Rankings/RankingsLanding"
import { TABS } from "./Hub/hubTabs"
import { v2Selection } from "./v2Selection"
import { ratingScopeURL, fetchLiveRating, type LiveRatingRequest } from "./ratingsLive"

export function LeaderboardsV2() {
  const [params, setParams] = useSearchParams()
  const { tab, instance } = v2Selection(params)
  const select = (key: "tab" | "instance", value?: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-[1920px] space-y-5 px-3 py-6 sm:px-6">
        <header className="relative overflow-hidden rounded-xl border bg-card">
          {instance && <><img src={getInstanceBackground(instance)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" /><div className="absolute inset-0 bg-gradient-to-t from-card via-card/80 to-card/30" /></>}
          <div className="relative px-5 pt-8 pb-5 sm:px-6 sm:pt-10">
            {instance && <button type="button" className="mb-2 flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground" onClick={() => select("instance")}> <ChevronLeft className="size-4" /> All instances</button>}
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Leaderboards · live preview</p>
            <h1 className="mt-1 text-3xl font-semibold">{instance ?? "All instances"}</h1>
            <p className="mt-2 text-sm text-muted-foreground">Published rankings only. Ratings use realm groups; other tabs retain their current live filters.</p>
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
        {tab === "ratings" ? <LiveRatings instance={instance} /> : instance ? (
          tab === "statistics" ? <InstanceView instanceName={instance} /> :
          tab === "performances" ? <p className="rounded-xl border p-8 text-muted-foreground">A dedicated live performances view is not available yet. The Statistics tab includes the current performance leaderboard.</p> :
          tab === "parsing" ? <ParsingInstanceView key={instance} instanceName={instance} /> :
          tab === "speedruns" ? <SpeedrunLeaderboard overrideInstance={instance} /> :
          tab === "rulesets" ? <RulesetInstanceView instanceName={instance} /> :
          <p className="rounded-xl border p-8 text-muted-foreground">A combined overview is not published. Choose a tab for live results.</p>
        ) : tab === "rulesets" ? <div onClickCapture={(event) => {
            const link = (event.target as HTMLElement).closest("a")
            const name = link && new URL(link.href).searchParams.get("instance")
            if (name) { event.preventDefault(); select("instance", name) }
          }}><RulesetsLanding /></div> : tab === "speedruns" ? <SpeedrunLeaderboard /> :
          tab === "statistics" || tab === "performances" || tab === "parsing" ? <RankingsLanding showTopPlayers={tab === "performances"} /> :
          <LiveInstanceGrid />}
      </main>
    </div>
  )
}

function LiveInstanceGrid() {
  const { data, isPending, isError } = useRankingsInstances()
  if (isPending) return <p role="status">Loading instances…</p>
  if (isError) return <p role="alert">Could not load instances.</p>
  if (!data?.length) return <p>No published instances yet.</p>
  return <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{data.map((row: RankingsInstanceSummary) => (
    <InstanceCard key={`${row.instance_name}-${row.difficulty_name}-${row.max_players}`} name={row.instance_name} to={`?tab=overview&instance=${encodeURIComponent(row.instance_name)}`} badge={row.difficulty_name}>
      <p className="text-xs text-muted-foreground">{row.total_kills.toLocaleString()} recorded kills · {row.max_players} players</p>
    </InstanceCard>
  ))}</div>
}

function LiveRatings({ instance }: { instance: string | null }) {
  const groups = useQuery({
    queryKey: ["rankings", "ratings", "groups"],
    queryFn: async () => {
      const response = await fetch("/api/v1/rankings/ratings/groups")
      if (!response.ok) throw new Error(`Groups request failed (${response.status})`)
      return response.json() as Promise<RatingRealmGroupsResponse>
    },
  })
  const summaries = useRankingsInstances()
  const filters = useRankingsFilters(instance ?? undefined)
  const [groupID, setGroupID] = useState("")
  const [metric, setMetric] = useState<LiveRatingRequest["metric"]>("renown")
  const [window, setWindow] = useState<LiveRatingRequest["window"]>("period")
  const [performance, setPerformance] = useState<"dps" | "hps">("dps")
  const [cohortKey, setCohortKey] = useState("")
  const group = groups.data?.groups.find((g) => g.id === groupID) ?? groups.data?.groups[0]
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
    groupID: group?.id ?? "", instanceName: instance ?? undefined, metric, window,
    cohort: metric === "renown" ? undefined : cohort && cls && spec ? {
      difficulty: cohort.difficulty_name, maxPlayers: cohort.max_players,
      playerClass: cls.player_class, spec: spec.spec, subSpec: selectedSubSpec, performance,
    } : undefined,
  }
  const url = ratingScopeURL(request)
  const ratings = useQuery({ queryKey: ["rankings", "ratings", url], queryFn: () => fetchLiveRating(url!), enabled: !!url, retry: false })
  if (groups.isPending || (metric !== "renown" && (summaries.isPending || filters.isPending))) return <p role="status">Loading rating cohorts…</p>
  if (groups.isError || (metric !== "renown" && (summaries.isError || filters.isError))) return <p role="alert">Could not load rating cohorts. Please try again later.</p>
  if (!groups.data?.groups.length) return <p>No published realm groups are configured.</p>
  return <section className="space-y-5 rounded-xl border bg-card p-5">
    <div className="flex flex-wrap gap-3">
      <label>Realm group <select aria-label="Realm group" className="ml-2 rounded border bg-background p-2" value={group?.id} onChange={(e) => setGroupID(e.target.value)}>
        {groups.data.groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.realms.map((r) => r.name).join(", ")})</option>)}
      </select></label>
      <label>Rating <select aria-label="Rating metric" className="ml-2 rounded border bg-background p-2" value={metric} onChange={(e) => { setMetric(e.target.value as LiveRatingRequest["metric"]); setWindow("period") }}>
        <option value="renown">Renown</option><option value="peak">Peak</option><option value="mastery">Mastery</option><option value="ranked_mastery">Ranked Mastery</option>
      </select></label>
      <label>Window <select aria-label="Rating window" className="ml-2 rounded border bg-background p-2" value={window} onChange={(e) => setWindow(e.target.value as LiveRatingRequest["window"])}>
        <option value="period">Period</option>{metric === "renown" ? <option value="career">Career</option> : metric === "peak" ? <option value="all_time">All time</option> : null}
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
    <p className="text-sm text-muted-foreground">{metric === "renown" ? "Renown has no class or spec cohort." : "Scores compare only the selected class, spec, performance metric and raid size."} Realm filtering within a group is not available. Character names are not included in the published response; IDs are shown instead.</p>
    {!url ? <p>{!instance && metric !== "renown" ? "Select an instance from the Overview tab to choose an exact raid cohort." : "No supported rating cohort is available for this selection."}</p> : ratings.isPending ? <p role="status">Loading ratings…</p> : ratings.isError ? <p role="alert">Could not load published ratings.</p> : !ratings.data?.entries.length ? <p>No published scores in this cohort yet.</p> :
      <ol className="divide-y">{ratings.data.entries.map((entry, index) => <li key={`${entry.player_guid}-${index}`} className="flex flex-wrap items-center gap-3 py-3 text-sm">
        <span className="w-8 text-muted-foreground">#{index + 1}</span><span className="font-mono text-xs">{entry.player_guid}</span>
        <span className="text-muted-foreground">{entry.player_class ? `${entry.player_class} · ${entry.player_spec} · ` : ""}{entry.instance_name || "Global"} · {group?.realms.find((r) => r.id === entry.realm_id)?.name ?? entry.realm_id}</span>
        <strong className="ml-auto tabular-nums">{entry.score.toLocaleString()}</strong>
      </li>)}</ol>}
    <Link to="/leaderboards/statistics" className="text-xs text-muted-foreground underline">Current leaderboards</Link>
  </section>
}
