import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useQuery } from "@tanstack/react-query"
import { GuildRatingBoards } from "../Hub/GuildRatings"
import { RatingFullList } from "./RatingFullList"
import type { RatingLiveData } from "./ratingLiveData"

vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn() }))

const entry = { id: "realm:mage", name: "Actual Mage", realm: "Realm", guid: "mage-guid", cls: "MAGE", spec: "Fire", subSpec: "", score: 72, detail: "Realm" }
const live: RatingLiveData = {
  pageKey: "cohort-1", board: () => ({ status: "loading" }),
  loadPage: vi.fn(async () => ({ rows: [], total: 0, page: 0, hasPreviousPage: false, hasNextPage: false })),
}

describe("Storybook full-list live data", () => {
  beforeEach(() => vi.mocked(useQuery).mockClear())

  it("shows the chosen boss scores behind a multi-boss Peak and omits unsupported kill metadata", () => {
    vi.mocked(useQuery).mockReturnValue({ isError: false, data: {
      rows: [{ rank: 1, entry: { ...entry, score: 50 }, peakComponents: [
        { encounter_name: "Lucifron", score: 0 }, { encounter_name: "Ragnaros", score: 100 },
      ] }], total: 1, page: 0, hasPreviousPage: false, hasNextPage: false,
    } } as ReturnType<typeof useQuery>)
    const html = renderToStaticMarkup(<RatingFullList scope={{}} title="Molten Core" encounterCount={2} period="180d"
      view="peak" query="" onQuery={vi.fn()} live={live} />)
    expect(html).toContain("Boss peaks")
    expect(html).not.toContain('<td class="w-full')
    expect(html).toContain('w-[22%]')
    expect(html).toContain('w-[28%]')
    expect(html).toContain('table-auto')
    expect(html).toContain('inline-flex items-center gap-1.5 whitespace-nowrap')
    expect(html).toContain('/c/icons/spec_mage_fire.png')
    expect(html).toContain("mean of 2, misses count 0")
    expect(html).toContain("2 bosses · 1 missed")
    expect(html).toContain('title="Lucifron: no kill"')
    expect(html).toContain('title="Ragnaros: 100.0"')
    expect(html).not.toContain("Total kill time")
    expect(html).not.toContain(">Date</th>")
  })

  for (const subject of ["player", "guild"] as const) {
    it(`shows readable ${subject} realms without changing same-name identities`, () => {
      const rows = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"].map((realm, i) => ({rank:0,entry:{...entry,id:realm+":same",guid:"same",realm,detail:realm,realmLabel:i===0?"Synthetic realm":undefined,score:80+i}}));
      vi.mocked(useQuery).mockReturnValue({isError:false,data:{rows,page:0,hasPreviousPage:false,hasNextPage:false}} as ReturnType<typeof useQuery>);
      const html = renderToStaticMarkup(subject === "player" ? <RatingFullList scope={{}} title="Raid" period="all" view="overview" query="" onQuery={vi.fn()} live={live} /> : <GuildRatingBoards instanceName="Raid" view="peak" onView={vi.fn()} allBosses={["A","B"]} where="Raid" onBoss={vi.fn()} data={{live,ratings:{peak:[],mastery:[],renown:[]},perBoss:()=>undefined}} />);
      const visible = html.replace(/<[^>]*>/g, "");
      expect(html).toContain(">Realm</th>");
      expect(html).not.toContain(">Record</th>");
      expect(visible).toContain("Synthetic realm");
      expect(visible).toContain("Unknown realm");
      expect(visible).not.toContain("11111111-1111");
      expect(visible).not.toContain("22222222-2222");
    });
  }

  it("renders the published ranks and scores in the existing table", () => {
    vi.mocked(useQuery).mockReturnValue({ isError: false, data: {
      rows: [{ rank: 17, entry, scores: { peak: { ...entry, score: 72 }, mastery: { ...entry, score: 60 }, renown: { ...entry, score: 3 } } }],
      total: 200, page: 0, hasPreviousPage: false, hasNextPage: true,
    } } as ReturnType<typeof useQuery>)
    const html = renderToStaticMarkup(<RatingFullList scope={{ boss: "Ragnaros" }} title="Ragnaros" period="180d"
      view="overview" query="Actual" onQuery={vi.fn()} live={live} />)
    expect(html).toContain("Actual Mage")
    expect(html).toContain('data-entity-kind="character"')
    expect(html).toContain('&quot;guid&quot;:&quot;mage-guid&quot;')
    expect(html).toContain("200 ranked")
    expect(html).not.toContain("Browse published ratings")
    const options = vi.mocked(useQuery).mock.lastCall![0] as unknown as { queryKey: unknown[]; enabled: boolean }
    expect(options.queryKey).toContain("Actual")
    expect(options.enabled).toBe(true)
  })
})
