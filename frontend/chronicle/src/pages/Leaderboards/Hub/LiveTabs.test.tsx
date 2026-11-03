import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import type { RankingsEntry, RankingsLeaderboardResponse, SpeedrunLeaderboardEntry } from "@/api/typesGenerated"
import { SpeedrunsTab } from "./SpeedrunsTab"
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
  instance_id: "live-run", slug: "live-speedrun", guild_name: "Live guild", duration_ms: 321000,
  completion_time: "2026-10-01T00:00:00Z", player_count: 20, realm_name: "Live realm",
} as SpeedrunLeaderboardEntry
const performance = { player_name: "Live player", log_hashed_slug: "live-log" } as RankingsEntry
const response: RankingsLeaderboardResponse = { entries: [performance], total_count: 1 }

function speedruns(live?: React.ComponentProps<typeof SpeedrunsTab>["live"]) {
  return renderToStaticMarkup(<SpeedrunsTab instanceName="Molten Core" bosses={["Ragnaros"]} selection={{ kind: "clear" }} live={live} />)
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
    expect(markup.match(/Live guild/g)).toHaveLength(2)
    expect(markup).toContain("<table")
  })

  it("distinguishes speedrun loading, empty, and error without showing fixtures", () => {
    expect(speedruns({})).toContain("Loading speedruns")
    expect(speedruns({ loading: true, entries: [speedrun] })).not.toContain("Live guild")
    expect(speedruns({ entries: [] })).toContain("No speedruns found")
    const error = speedruns({ error: new Error("Offline") })
    expect(error).toContain("Could not load speedruns: Offline")
    expect(error).not.toContain("<table")
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
