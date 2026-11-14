import { describe, expect, it } from "vitest"
import { hubEncounterVariants, hubEncounterVariantParams, hubInstanceParams, hubParams, hubPath, hubRatingParams, hubRatingView, hubSubject, hubSubjectParams, v2Selection } from "./v2Selection"

describe("leaderboard hub selection", () => {
  it("opens the live overview without selecting a mock instance", () => {
    expect(v2Selection(new URLSearchParams())).toEqual({ tab: "overview", instance: null, encounters: [], realmIDs: [] })
  })

  it("reads landing tabs and exact instance names from path segments", () => {
    expect(v2Selection(new URLSearchParams(), { segment: "ratings" })).toEqual({
      tab: "ratings", instance: null, encounters: [], realmIDs: [],
    })
    expect(v2Selection(new URLSearchParams(), { instance: "Blackwing-Lair", tab: "ratings" })).toEqual({
      tab: "ratings", instance: "Blackwing Lair", encounters: [], realmIDs: [],
    })
    expect(v2Selection(new URLSearchParams(), { segment: "Blackwing-Lair" })).toEqual({
      tab: "overview", instance: "Blackwing Lair", encounters: [], realmIDs: [],
    })
  })

  it("reads optional realm selection without duplicates", () => {
    expect(v2Selection(new URLSearchParams("realm_ids=realm-1%2Crealm-2%2Crealm-1"), { segment: "ratings" })).toEqual({
      tab: "ratings", instance: null, encounters: [], realmIDs: ["realm-1", "realm-2"],
    })
  })

  it("keeps realm selection while entering or leaving an instance", () => {
    const selected = new URLSearchParams("realm_ids=realm-1%2Crealm-2")
    expect(hubPath("ratings", selected, "Molten Core")).toBe("/leaderboards/Molten-Core/ratings?realm_ids=realm-1%2Crealm-2")
    expect(hubPath("ratings", selected)).toBe("/leaderboards/ratings?realm_ids=realm-1%2Crealm-2")
    expect(hubParams(selected, "realm_ids").has("realm_ids")).toBe(false)
  })

  it("keeps chosen encounters in the query and resets pagination", () => {
    // The legacy single-boss link still opens that boss.
    const params = new URLSearchParams("encounter=Ragnaros&realm_ids=realm-1&page=3")
    expect(v2Selection(params, { instance: "Molten-Core", tab: "performances" }).encounters).toEqual(["Ragnaros"])
    const set = hubParams(params, "encounters", "Lucifron,Ragnaros")
    expect(v2Selection(set).encounters).toEqual(["Lucifron", "Ragnaros"])
    expect(set.has("page")).toBe(false)
    expect(set.has("encounter")).toBe(false)
  })

  it("keeps the selected ratings board in a shareable query", () => {
    for (const view of ["peak", "mastery", "renown"] as const) {
      const params = hubRatingParams(new URLSearchParams("realm_ids=realm-1"), view)
      expect(hubRatingView(params)).toBe(view)
      expect(hubPath("ratings", params, "Molten Core")).toBe(`/leaderboards/Molten-Core/ratings?realm_ids=realm-1&rating=${view}`)
    }

    expect(hubRatingView(new URLSearchParams("rating=unknown"))).toBe("overview")
    expect(hubRatingParams(new URLSearchParams("rating=peak&realm_ids=realm-1"), "overview").toString()).toBe("realm_ids=realm-1")
  })

  it("keeps guild mode in a shareable query and uses characters as the clean default", () => {
    const guilds = hubSubjectParams(new URLSearchParams("rating=renown"), "guilds")
    expect(hubSubject(guilds)).toBe("guilds")
    expect(hubPath("ratings", guilds, "Molten Core")).toBe("/leaderboards/Molten-Core/ratings?rating=renown&subject=guild")
    expect(hubSubject(new URLSearchParams("subject=guilds"))).toBe("guilds")

    expect(hubSubject(new URLSearchParams("subject=unknown"))).toBe("characters")
    expect(hubSubjectParams(new URLSearchParams("subject=guild&rating=peak"), "characters").toString()).toBe("rating=peak")
  })

  it("drops instance-specific state when changing instances", () => {
    const params = new URLSearchParams("instance=Molten+Core&encounter=Ragnaros&difficulty=Normal&size=40&subject=guild&realm_ids=realm-1")
    params.set("encounter_variants", JSON.stringify({ Hodir: "hard" }))
    const next = hubInstanceParams(params)
    expect(next.has("encounter_variants")).toBe(false)
    expect(next.has("instance")).toBe(false)
    expect(next.has("encounter")).toBe(false)
    expect(next.has("difficulty")).toBe(false)
    expect(next.has("size")).toBe(false)
    expect(next.get("subject")).toBe("guild")
    expect(next.get("realm_ids")).toBe("realm-1")
  })

  it("falls back to the overview for unknown tabs", () => {
    expect(v2Selection(new URLSearchParams(), { instance: "Molten-Core", tab: "unknown" })).toEqual({
      tab: "overview", instance: "Molten Core", encounters: [], realmIDs: [],
    })
  })

  it("puts the instance and tab in the path and removes their legacy query parameters", () => {
    const params = new URLSearchParams("tab=ratings&instance=Molten+Core&encounters=Garr")
    expect(hubPath("performances", params, "Molten Core")).toBe("/leaderboards/Molten-Core/performances?encounters=Garr")
    expect(hubPath("overview", params, "Molten Core")).toBe("/leaderboards/Molten-Core?encounters=Garr")
    expect(hubPath("ratings", params)).toBe("/leaderboards/ratings?encounters=Garr")
    expect(hubPath("overview", new URLSearchParams())).toBe("/leaderboards")
  })
})

describe("encounter variant URLs", () => {
  it.each(["broken", "null", "[]", "42", '"hard"', '{"Hodir":"combined"}', '{"Freya":"hard"}', '{"__proto__":"hard"}'])("ignores invalid selections: %s", value => {
    expect(hubEncounterVariants(new URLSearchParams({ encounter_variants: value }), "Ulduar")).toEqual({})
  })
  it("validates each entry and instance without relying on loaded boss metadata", () => {
    const params = new URLSearchParams({ encounter_variants: '{"Freya":"hard","Hodir":"normal","Thorim":null}' })
    expect(hubEncounterVariants(params, "Ulduar")).toEqual({ Hodir: "normal" })
    expect(hubEncounterVariants(params, "Naxxramas")).toEqual({})
    expect(hubEncounterVariants(params, null)).toEqual({})
  })
  it("writes canonical maps atomically with pagination reset and preserves other scope", () => {
    const params = new URLSearchParams("page=3&realm_ids=realm-1&difficulty=Normal&size=10&spec=Frost&subject=guild&encounters=Hodir")
    const next = hubEncounterVariantParams(params, { Hodir: "hard" })
    expect(next.get("encounter_variants")).toBe('{"Hodir":"hard"}')
    expect(next.has("page")).toBe(false)
    for (const key of ["realm_ids", "difficulty", "size", "spec", "subject", "encounters"]) expect(next.get(key)).toBe(params.get(key))
    expect(hubEncounterVariantParams(next, {}).has("encounter_variants")).toBe(false)
    expect(params.get("page")).toBe("3")
  })
})

it("round-trips independent XT and Hodir cohorts across unsupported tabs", () => {
 const variants = { "XT-002 Deconstructor": "normal" as const, Hodir: "hard" as const };
 const params = hubEncounterVariantParams(new URLSearchParams("page=5"), variants);
 expect(params.get("encounter_variants")).toBe('{"Hodir":"hard","XT-002 Deconstructor":"normal"}');
 expect(params.has("page")).toBe(false);
 expect(hubEncounterVariants(params, "Ulduar")).toEqual(variants);
 expect(hubEncounterVariants(params, "Other")).toEqual({});
 expect(hubPath("speedruns", params, "Ulduar")).toContain("encounter_variants=");
});
