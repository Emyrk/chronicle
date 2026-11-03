import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { RankingsEntry } from "@/api/typesGenerated"
import { useRankingsLeaderboard } from "@/api/rankingsQueries"
import { LivePerformances } from "./LivePerformances"

vi.mock("@/api/rankingsQueries", () => ({ useRankingsLeaderboard: vi.fn() }))
vi.mock("@/pages/Rankings/RankingsTable", () => ({
  RankingsTable: ({ entries, metric, loading }: {
    entries: { rank: number; log_hashed_slug: string; player_name: string }[]
    metric: string
    loading?: boolean
  }) => loading
    ? <div>Loading rankings</div>
    : entries.length
      ? <div data-metric={metric}>{entries.map((e) => <a key={e.rank} href={`/instances/${e.log_hashed_slug}`}>{e.rank}. {e.player_name}</a>)}</div>
      : <div>No records found</div>,
}))

const boss = { kind: "bosses" as const, bosses: ["Ragnaros"] }
const row = { player_name: "Live player", log_hashed_slug: "live-log" } as RankingsEntry

function mockQuery(state: Record<string, unknown>) {
  vi.mocked(useRankingsLeaderboard).mockReturnValue({
    data: undefined, isLoading: false, isFetching: false, isError: false,
    refetch: vi.fn(), error: null, ...state,
  } as unknown as ReturnType<typeof useRankingsLeaderboard>)
}

function render(props: Partial<React.ComponentProps<typeof LivePerformances>> = {}) {
  return renderToStaticMarkup(<LivePerformances instanceName="Molten Core" selection={boss} role="dps" {...props} />)
}

beforeEach(() => vi.clearAllMocks())

describe("LivePerformances", () => {
  it("requests an exact boss and controlled class, spec, role, and realm without fixture data", () => {
    mockQuery({ data: { entries: [row], total_count: 51 } })
    const markup = render({ cls: "MAGE", spec: "Fire", subSpec: "Ignite", realmName: "Nordanaar", role: "healing" })
    expect(useRankingsLeaderboard).toHaveBeenCalledWith({
      instance_names: "Molten Core", encounter_names: "Ragnaros", class: "MAGE",
      spec: "Fire", sub_spec: "Ignite", role: "heal", realm_names: "Nordanaar",
      metric: "hps", limit: 50, offset: 0,
    }, true)
    expect(markup).toContain('href="/instances/live-log"')
    expect(markup).toContain('data-metric="hps"')
    expect(markup).toContain("1–1 of 51")
    expect(markup).toContain("Next page")
  })

  it("does not query an unsupported full clear or multi-boss selection", () => {
    mockQuery({})
    for (const selection of [{ kind: "clear" as const }, { kind: "bosses" as const, bosses: ["Ragnaros", "Garr"] }]) {
      const markup = render({ selection })
      expect(markup).toContain("Select exactly one boss")
      expect(markup).not.toContain("No records found")
    }
    expect(vi.mocked(useRankingsLeaderboard).mock.calls.every(([, enabled]) => enabled === false)).toBe(true)
  })

  it("distinguishes loading, empty, and error states", () => {
    mockQuery({ isLoading: true, isFetching: true })
    expect(render()).toContain("Loading rankings")
    mockQuery({ data: { entries: [], total_count: 0 } })
    expect(render()).toContain("No records found")
    mockQuery({ isError: true, error: new Error("Offline") })
    const markup = render()
    expect(markup).toContain("Could not load performances: Offline")
    expect(markup).toContain("Try again")
    expect(markup).not.toContain("No records found")
  })
})
