import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useHubSummary, type HubSummary } from "./hubSummaryAdapter"
import { LiveHubOverview } from "./LiveHubOverview"

vi.mock("./hubSummaryAdapter", () => ({ useHubSummary: vi.fn() }))

const cohort = { difficulty: "", maxPlayers: 0 }
const entry = { player_guid: "mage-1", player_name: "Actual Mage", player_class: "MAGE", player_spec: "Frost", player_sub_spec: "", score: 42, realm_id: "realm-1", realm_name: "Turtle" }
const guild = { guild_id: "guild-1", guild_name: "Actual Guild", score: 15, realm_id: "realm-1", realm_name: "Turtle" }
const ratings = { player: { peak: [entry], ranked_mastery: [entry], renown: [entry] }, guild: { peak: [guild], ranked_mastery: [guild], renown: [guild] } }
const summary = { landing_previews: [], selected_cohort: { difficulty_name: "", max_players: 0 }, generation_id: null, instances: [{ category: "raid", instance_name: "Molten Core", difficulty_name: "", max_players: 0, total_kills: 12, top_players: [] }],
  encounters: [{ encounter_name: "Ragnaros", total_kills: 12, top_dps: 1532.69 }],
  ratings: { raid: ratings, bosses: [{ encounter_name: "Ragnaros", ...ratings }] },
  speedruns: [], performances: [], realms: [], filters: [], progression_bosses: ["Ragnaros"], ranking_encounter_sets: [],
} as HubSummary
const base = { instanceName: "Molten Core", summary, requestedEncounter: "Ragnaros", selection: { kind: "bosses" as const, bosses: ["Ragnaros"] },
  subject: "player" as const, role: "dps" as const, cls: undefined, spec: undefined, subSpec: undefined,
  performanceCohort: cohort, ratingCohort: { ...cohort, performance: "dps" as const },
  onTab: vi.fn(), onBoss: vi.fn(), onRatings: vi.fn(), bosses: ["Ragnaros"] }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useHubSummary).mockReturnValue({ isPending: false, isError: false, data: summary } as ReturnType<typeof useHubSummary>)
})

describe("live Hub overview summary", () => {
  it("renders the raid and boss rating previews from one summary without additional requests", () => {
    const html = renderToStaticMarkup(<LiveHubOverview {...base} />)
    expect(html).toContain("Actual Mage")
    expect(html).toContain("Actual Guild")
    expect(html).toContain("1,533/s")
    expect(vi.mocked(useHubSummary)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(useHubSummary).mock.calls[0][1]).toBe(false)
  })

  it("fetches one complete, exact zero-size summary when role or class changes", () => {
    renderToStaticMarkup(<LiveHubOverview {...base} cls="MAGE" spec="Frost" role="healing"
      ratingCohort={{ ...cohort, playerClass: "MAGE", spec: "Frost", subSpec: "", performance: "hps" }} />)
    expect(vi.mocked(useHubSummary).mock.calls[0][0]).toMatchObject({
      instanceName: "Molten Core", cohort, performance: "hps", cls: "MAGE", spec: "Frost" })
    expect(vi.mocked(useHubSummary).mock.calls[0][1]).toBe(true)
  })

  it("does not invent exact Peak scores without a selected cohort", () => {
    const html = renderToStaticMarkup(<LiveHubOverview {...base} ratingCohort={undefined} performanceCohort={undefined} />)
    expect(html).toContain("Exact cohort unavailable")
  })
})
