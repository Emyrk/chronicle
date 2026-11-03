import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { useQuery } from "@tanstack/react-query"
import { RatingFullList } from "./RatingFullList"
import type { RatingLiveData } from "./ratingLiveData"

vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn() }))

const entry = { id: "realm:mage", name: "Actual Mage", realm: "Realm", guid: "mage-guid", cls: "MAGE", spec: "Fire", subSpec: "", score: 72, detail: "Realm" }
const live: RatingLiveData = {
  pageKey: "cohort-1", board: () => ({ status: "loading" }),
  loadPage: vi.fn(async () => ({ rows: [], total: 0, page: 0, hasPreviousPage: false, hasNextPage: false })),
}

describe("Storybook full-list live data", () => {
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
    const options = vi.mocked(useQuery).mock.calls[0][0] as unknown as { queryKey: unknown[]; enabled: boolean }
    expect(options.queryKey).toContain("Actual")
    expect(options.enabled).toBe(true)
  })
})
