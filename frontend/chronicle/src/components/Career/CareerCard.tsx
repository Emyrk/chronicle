import type { ReactNode } from "react"
import type { CareerIssue, CareerSummary, CareerPlayerResponse, CareerGuildResponse } from "@/api/typesGenerated"
import { usePlayerCareer, useGuildCareer } from "@/api/career"
import { useSiteConfig } from "@/api/queries"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card/Card"

function careerStatus(status: string): string | undefined {
  switch (status) {
    case "ready": return undefined
    case "weights_pending": return "Performance weights are not configured. Renown remains independent."
    case "configuration_pending": return "Career configuration is not ready."
    case "preparing": return "Career scores are being prepared."
    case "no_active_raids": return "No active career raids are configured."
    case "no_evidence": return "No eligible career evidence yet."
    default: return "Career scores are not available yet."
  }
}
const score = (value: number | null) => value === null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 2 })
const variant = (row: { instance_name: string; difficulty_name: string; max_players: number }) =>
  `${row.instance_name} · ${row.difficulty_name || "Default"} · ${row.max_players > 0 ? `${row.max_players} players` : "size not recorded"}`
const variantKey = (row: { instance_name: string; difficulty_name: string; max_players: number }) => JSON.stringify([row.instance_name, row.difficulty_name, row.max_players])

export function CareerSummaryView({ summary, guild = false }: { summary: CareerSummary; guild?: boolean }) {
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">{guild ? "Kill-time performance" : summary.chosen_metric ? `Stored performance metric: ${summary.chosen_metric.toUpperCase()}` : "Performance metric not selected yet"}</p>
    {careerStatus(summary.performance_status) && <p role="status" className="text-sm text-muted-foreground">{careerStatus(summary.performance_status)}</p>}
    <dl className="grid grid-cols-3 gap-4 border-y border-border py-3">
      {([ ["Mastery", summary.mastery], ["Peak", summary.peak], ["Renown", summary.renown] ] as const).map(([label, value]) =>
        <div key={label}><dt className="text-xs tracking-wide text-muted-foreground uppercase">{label}</dt><dd className="mt-1 font-mono text-xl tabular-nums">{score(value)}</dd></div>)}
    </dl>
    {summary.refresh_pending && <p role="status" className="text-xs text-amber-500">Refresh pending. Displayed values are the last prepared results.</p>}
    {summary.computed_at && <p className="text-xs text-muted-foreground">Computed <time dateTime={summary.computed_at}>{summary.computed_at}</time></p>}
    <details className="group rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">Raid contributions ({summary.contributions.length})</summary>
      <div className="styled-scrollbar mt-3 overflow-x-auto">
        <table className="w-full text-left text-xs"><thead><tr className="text-muted-foreground"><th className="p-2">Raid variant</th><th className="p-2">Weight</th><th className="p-2">Mastery</th><th className="p-2">Peak</th><th className="p-2">Renown</th><th className="p-2">Eligible kills · performance / Renown</th></tr></thead>
          <tbody>{summary.contributions.map(row => <tr key={variantKey(row)} className="border-t">
            <th className="p-2 font-normal">{variant(row)}</th><td className="p-2">{row.include_average ? score(row.weight) : "Excluded from average"}</td>
            <td className="p-2 font-mono">{row.include_average ? score(row.mastery) : "—"}</td><td className="p-2 font-mono">{row.include_average ? score(row.peak) : "—"}</td>
            <td className="p-2 font-mono">{row.include_renown ? score(row.renown) : "Excluded"}</td><td className="p-2 font-mono">{row.eligible_metric_kills} / {row.eligible_renown_kills}</td>
          </tr>)}</tbody></table>
      </div>
    </details>
  </div>
}
function Issues({ issues }: { issues: readonly CareerIssue[] }) {
  return issues.length > 0 && <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Configuration details ({issues.length})</summary><ul className="mt-2 space-y-1">{issues.map(issue => <li key={`${variantKey(issue)}:${issue.code}`}>{variant(issue)}: {issue.code.replaceAll("_", " ")}</li>)}</ul></details>
}
export function PlayerCareerContent({ data }: { data: CareerPlayerResponse }) {
  return <>{careerStatus(data.status) && <p role="status" className="text-sm text-muted-foreground">{careerStatus(data.status)}</p>}
    {data.cohorts.length === 0 && data.status === "ready" && <p className="text-sm text-muted-foreground">No eligible career specializations yet.</p>}
    <div className="space-y-6">{data.cohorts.map(cohort => <section key={JSON.stringify([cohort.player_class, cohort.player_spec, cohort.player_sub_spec])}>
      <h3 className="mb-2 text-sm font-semibold">{cohort.player_class} · {cohort.player_spec}{cohort.player_sub_spec && ` · ${cohort.player_sub_spec}`}</h3>
      <CareerSummaryView summary={cohort.summary} />
    </section>)}</div><Issues issues={data.issues} /></>
}
export function GuildCareerContent({ data }: { data: CareerGuildResponse }) {
  return <>{careerStatus(data.status) && <p role="status" className="text-sm text-muted-foreground">{careerStatus(data.status)}</p>}<CareerSummaryView summary={data.summary} guild /><Issues issues={data.issues} /></>
}
export function CareerFrame({ loading, error, children }: { loading: boolean; error: boolean; children: ReactNode }) {
  return <Card className="mb-4"><CardHeader><CardTitle className="text-base">Career scores</CardTitle></CardHeader><CardContent>
    {loading ? <p role="status" className="text-sm text-muted-foreground">Loading career scores…</p> : <>{error && <p role="alert" className="mb-3 text-sm text-destructive">Career scores could not be refreshed. Any displayed results are from the last successful load.</p>}{children}</>}
  </CardContent></Card>
}
export function PlayerCareerCard({ realm, player }: { realm: string; player: string }) {
  const { data: config } = useSiteConfig()
  const query = usePlayerCareer(config?.tenant?.id, realm, player)
  return <CareerFrame loading={query.isPending} error={query.isError}>{query.data && <PlayerCareerContent data={query.data} />}</CareerFrame>
}
export function GuildCareerCard({ guildID }: { guildID: string }) {
  const { data: config } = useSiteConfig()
  const query = useGuildCareer(config?.tenant?.id, guildID)
  return <CareerFrame loading={query.isPending} error={query.isError}>{query.data && <GuildCareerContent data={query.data} />}</CareerFrame>
}
