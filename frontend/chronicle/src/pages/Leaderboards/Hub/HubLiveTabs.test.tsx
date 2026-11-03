import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { StatisticsTab, type LiveStatisticsData } from "./StatisticsTab"
import { ParsingTab, type LiveParsingData } from "./ParsingTab"

vi.mock("@/pages/Rankings/BoxPlotChart", () => ({ BoxPlotChart: ({ stats }: { stats: unknown[] }) => <p>Box plot: {stats.length}</p> }))
vi.mock("@/pages/Rankings/InstanceView", () => ({
  KillTimeContent: ({ stats }: { stats: unknown[] }) => <p>Kill times: {stats.length}</p>,
  SuccessRateContent: ({ rates }: { rates: unknown[] }) => <p>Success rates: {rates.length}</p>,
}))
vi.mock("@/pages/Leaderboards/Parsing/SpecView", () => ({ SpecView: ({ bossSpreads }: { bossSpreads: unknown[] }) => <p>Spec detail: {bossSpreads.length}</p> }))
vi.mock("@/pages/Leaderboards/Parsing/SpreadsView", () => ({ SpreadsView: ({ spreads }: { spreads: unknown[] }) => <p>Spec spreads: {spreads.length}</p> }))
vi.mock("@/pages/Leaderboards/Parsing/KillTimesView", () => ({ KillTimesView: ({ spreads }: { spreads: unknown[] }) => <p>Time spreads: {spreads.length}</p> }))

const common = {
  instanceName: "Raid", scope: {}, role: "dps" as const, selection: { kind: "bosses" as const, bosses: ["Boss A"] },
  onScope: vi.fn(),
}
const statistics = { ...common, bosses: ["Boss A", "Boss B"], optional: new Set<string>(), view: "specs" as const, onView: vi.fn() }
const parsing = { ...common, allBosses: ["Boss A", "Boss B"], subject: "characters" as const, onBoss: vi.fn(), onClear: vi.fn() }
const difficulty = { key: "Normal|40", difficultyName: "Normal", maxPlayers: 40, sampleSize: 1 }

const renderStats = (live?: LiveStatisticsData, view: "specs" | "killtimes" | "success" = "specs") =>
  renderToStaticMarkup(<StatisticsTab {...statistics} view={view} live={live} />)
const renderParsing = (live?: LiveParsingData, subject: "characters" | "guilds" = "characters", scope = {}) =>
  renderToStaticMarkup(<ParsingTab {...parsing} subject={subject} scope={scope} live={live} />)

describe("Hub live tabs", () => {
  it("retains Storybook tab structure when live data is omitted", () => {
    expect(renderStats()).toContain('aria-label="Statistics view"')
    expect(renderStats()).toContain("Box plot:")
    expect(renderParsing()).toContain('aria-label="Parsing view"')
    expect(renderParsing()).toContain("Spec spreads:")
  })

  it("never substitutes fixture distributions for unavailable, loading or failed live statistics", () => {
    expect(renderStats({})).toContain("Spec distributions unavailable")
    expect(renderStats({ specs: { status: "loading" } })).toContain('role="status"')
    expect(renderStats({ specs: { status: "error" } })).toContain('role="alert"')
    expect(renderStats({ specs: { status: "ready", data: [] } })).toContain("Box plot: 0")
    expect(renderStats({ clearTimes: { status: "ready", data: [] } }, "killtimes")).toContain("Boss kill times unavailable")
    expect(renderStats({}, "success")).toContain("Success rates unavailable")
  })

  it("requires a real raid population and live spreads in both character and guild views", () => {
    expect(renderParsing({})).toContain("raid population")
    expect(renderParsing({ difficulty, spreads: { status: "loading" } })).toContain('role="status"')
    expect(renderParsing({ difficulty, spreads: { status: "error" } })).toContain('role="alert"')
    expect(renderParsing({ difficulty }, "guilds")).toContain("Kill-time parses unavailable")
    expect(renderParsing({ difficulty, times: { status: "ready", data: [] } }, "guilds")).toContain("Time spreads: 0")
  })

  it("does not broaden live parse cohorts across difficulties or bosses", () => {
    const spread = { encounter_name: "Boss A", difficulty_name: "Normal", max_players: 40, player_class: "MAGE", player_spec: "Fire", sample_size: 1, status: "ok", min: 10, median: 20, max: 30, cutoffs: [] }
    const live = { difficulty, spreads: { status: "ready" as const, data: [spread, { ...spread, max_players: 20 }, { ...spread, encounter_name: "Boss B" }] } }
    expect(renderParsing(live)).toContain("Spec spreads: 1")
    expect(renderParsing(live, "characters", { spec: "Fire" })).toContain("Spec detail: 1")
  })
})
