import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import type { RankingsEntry, RankingsLeaderboardResponse, SpeedrunLeaderboardEntry } from "@/api/typesGenerated"
import { SpeedrunsTab } from "./SpeedrunsTab"
import { StatisticsTab } from "./StatisticsTab"
import { PerformancesTab } from "./PerformancesTab"

vi.mock("@/pages/Leaderboard/Podium", () => ({
  Podium: ({ entries }: { entries: SpeedrunLeaderboardEntry[] }) => <div data-testid="podium">{entries.map((entry) => entry.guild_name).join(", ")}</div>,
}))
vi.mock("@/pages/Rankings/RankingsTable", () => ({
  RankingsTable: ({ entries, metric, loading }: { entries: (RankingsEntry & { rank: number })[]; metric: string; loading?: boolean }) =>
    loading ? <div>Loading rankings</div> : entries.length
      ? <div data-metric={metric}>{entries.map((entry) => <a key={entry.rank} href={`/instances/${entry.log_hashed_slug}`}>{entry.rank}. {entry.player_name}</a>)}</div>
      : <div>No records found for the current filters.</div>,
}))

const speedrun = {
  instance_id: "live-run", slug: "live-speedrun", guild_id: "live-guild", guild_name: "Live guild", duration_ms: 321000,
  start_time: "2026-10-01T00:00:00Z", completion_time: "2026-10-01T00:05:21Z", player_count: 20, realm_name: "Live realm",
} as SpeedrunLeaderboardEntry
const performance = { player_name: "Live player", log_hashed_slug: "live-log" } as RankingsEntry
const response: RankingsLeaderboardResponse = { entries: [performance], total_count: 1 }

type SpeedrunsLive = NonNullable<React.ComponentProps<typeof SpeedrunsTab>["live"]>
function speedruns(clears?: SpeedrunsLive["clears"], extra?: Partial<React.ComponentProps<typeof SpeedrunsTab>>) {
  return renderToStaticMarkup(<SpeedrunsTab instanceName="Molten Core" bosses={["Lucifron", "Ragnaros"]} selection={{ kind: "clear" }} live={clears ? { clears } : undefined} {...extra} />)
}
function performances(live?: React.ComponentProps<typeof PerformancesTab>["live"], subject: "characters" | "guilds" = "characters") {
  return renderToStaticMarkup(<PerformancesTab instanceName="Molten Core" scope={{ boss: "Ragnaros" }} role="healing" subject={subject} bosses={["Ragnaros"]} where="Ragnaros" onSpeedruns={() => {}} live={live} />)
}

describe("Hub leaderboard live props", () => {
  it("keeps the Storybook speedrun podium and table with no live prop", () => {
    const markup = speedruns()
    expect(markup).toContain('data-testid="podium"')
    expect(markup).toContain("Fastest full clears")
    expect(markup).toContain("<table")
    expect(markup).not.toContain("Live guild")
  })

  it("uses only supplied speedruns in both podium and table", () => {
    const markup = speedruns({ entries: [speedrun] })
    expect(markup).toContain('data-testid="podium">Live guild')
    expect(markup).toContain("Live realm")
    expect(markup).toContain("5:21")
    expect(markup.match(/>Live guild</g)).toHaveLength(2)
    expect(markup).toContain('data-entity-kind="guild"')
    expect(markup).toContain('data-entity-kind="raid"')
    expect(markup).toContain("<table")
  })

  it("distinguishes speedrun loading, empty, and error without showing fixtures", () => {
    expect(speedruns({ loading: true })).toContain("Loading speedruns")
    expect(speedruns({ loading: true, entries: [speedrun] })).not.toContain("Live guild")
    expect(speedruns({ entries: [] })).toContain("No speedruns found")
    const error = speedruns({ error: new Error("Offline") })
    expect(error).toContain("Could not load speedruns: Offline")
    expect(error).not.toContain("<table")
  })

  it("opens a hand-picked set on its bosses' kill times and loads only that board", () => {
    const kill = { encounter_id: "k1", instance_id: "run-1", instance_name: "Molten Core", encounter_name: "Ragnaros", guild_name: "Fast Guild", guild_id: "g1", realm_name: "Realm", duration_secs: 95, killed_at: "2026-10-01T00:00:00Z" }
    const markup = renderToStaticMarkup(<SpeedrunsTab instanceName="Molten Core" bosses={["Lucifron", "Ragnaros"]} selection={{ kind: "bosses", bosses: ["Ragnaros"] }}
      live={{ kills: { entries: [kill as never] } }} />)
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Kill times · Ragnaros/)
    expect(markup).toContain("&lt;Fast Guild&gt;")
    expect(markup).toContain("1:35")
    expect(markup).toContain('data-entity-kind="guild"')
    expect(markup).toContain('data-entity-kind="encounter"')
    expect(markup).not.toContain("Fastest full clears")
  })

  it("keeps Storybook performances and renders live ranked rows with the selected metric", () => {
    const fixture = performances()
    expect(fixture).toContain('data-metric="hps"')
    expect(fixture).not.toContain("Live player")
    const markup = performances({ response })
    expect(markup).toContain('data-metric="hps"')
    expect(markup).toContain('href="/instances/live-log"')
    expect(markup).toContain("1. Live player")
    expect(markup).not.toContain("mock-")
  })

  it("distinguishes performance loading, empty, and error without showing fixtures", () => {
    expect(performances({})).toContain("Loading rankings")
    expect(performances({ loading: true, response })).not.toContain("Live player")
    expect(performances({ response: { entries: [], total_count: 0 } })).toContain("No records found")
    const error = performances({ error: new Error("Offline") })
    expect(error).toContain("Could not load performances: Offline")
    expect(error).not.toContain("No records found")
  })

  it("retains the guild-to-speedruns interaction instead of rendering performance records", () => {
    expect(performances({ response }, "guilds")).toContain("Open Speedruns")
    expect(performances({ response }, "guilds")).not.toContain("Live player")
  })
})

describe("Statistics unknowns", () => {
  const row = (cls: string, spec: string, median: number) => ({ player_class: cls, player_spec: spec, min_dps: median - 50, q1_dps: median - 10, median_dps: median, q3_dps: median + 10, max_dps: median + 50, count: 9 })
  it("hides unknown classes and specs by default and offers to show them", () => {
    const html = renderToStaticMarkup(
      <StatisticsTab instanceName="Molten Core" bosses={["Ragnaros"]} optional={new Set()} selection={{ kind: "clear" }} view="specs" onView={() => {}}
        scope={{}} role="dps" onScope={() => {}} live={{ specs: { status: "ready", data: [row("MAGE", "Fire", 900), row("Unknown", "Unknown", 999), row("WARRIOR", "Unknown", 800)] } }} />,
    )
    expect(html).toContain("Show unknowns")
    expect(html).toContain("Fire")
    expect(html).not.toContain("Unknown") // case-sensitive: the toggle reads "Show unknowns"
  })
})
