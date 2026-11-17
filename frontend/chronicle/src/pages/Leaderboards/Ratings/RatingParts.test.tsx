import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ClassIcon } from "@/pages/RaidPlanner/ClassIcon"
import { EntryRow, SpecIcon } from "./RatingParts"
import { GuildName } from "@/pages/Leaderboards/Hub/GuildRatings"
import { METRIC_THEMES } from "./ratingThemes"

describe("published rating icons", () => {
  it("does not request an icon for all-class Renown rows", () => {
    const html = renderToStaticMarkup(<EntryRow entry={{ id: "one", name: "Raider", cls: "", spec: "", subSpec: "", score: 10, detail: "Realm" }} theme={METRIC_THEMES.renown} size="sm" />)
    expect(html).toContain("Raider")
    expect(html).not.toContain("/c/icons/")
  })

  it("shows readable realms instead of internal IDs in entry subtitles", () => {
    const entry = { id: "one", name: "Raider", cls: "MAGE", spec: "Unknown", subSpec: "", score: 100, detail: "internal-realm-uuid", realmLabel: "Nordanaar" }
    const html = renderToStaticMarkup(<EntryRow entry={entry} theme={METRIC_THEMES.peak} size="sm" />)
    expect(html).toContain("Unknown · Nordanaar")
    expect(html).not.toContain("internal-realm-uuid")
    const missing = renderToStaticMarkup(<EntryRow entry={{ ...entry, realmLabel: " " }} theme={METRIC_THEMES.peak} size="sm" />)
    expect(missing).toContain("Unknown realm")
    expect(missing).not.toContain("internal-realm-uuid")
  })

  it("uses the known unknown asset rather than class_.png for an empty class", () => {
    const html = renderToStaticMarkup(<ClassIcon cls="" />)
    expect(html).toContain("/c/icons/class_unknown.png")
    expect(html).not.toContain("/c/icons/class_.png")
  })

  it("uses a class icon directly when a class has no spec", () => {
    const html = renderToStaticMarkup(<SpecIcon cls="MAGE" spec="" />)
    expect(html).toContain("/c/icons/class_mage.png")
    expect(html).not.toContain("/c/icons/spec_mage_.png")
  })

  it("uses class-qualified real specialization assets, including shared spec names", () => {
    expect(renderToStaticMarkup(<SpecIcon cls="MAGE" spec="Frost" />)).toContain("/c/icons/spec_mage_frost.png")
    expect(renderToStaticMarkup(<SpecIcon cls="HUNTER" spec="Survival" />)).toContain("/c/icons/spec_hunter_survival.png")
    expect(renderToStaticMarkup(<SpecIcon cls="DRUID" spec="Restoration" />)).toContain("/c/icons/spec_druid_restoration.png")
    expect(renderToStaticMarkup(<SpecIcon cls="SHAMAN" spec="Restoration" />)).toContain("/c/icons/spec_shaman_restoration.png")
    expect(renderToStaticMarkup(<SpecIcon cls="" spec="Unknown" />)).toBe("")
  })

  it("marks a character's guild separately in both row sizes", () => {
    const entry = { id: "one", name: "Raider", realm: "Turtle", guid: "Player-1", guild: "Raiders", guildId: "guild-1", cls: "MAGE", spec: "Fire", subSpec: "", score: 10, detail: "Turtle" }
    for (const size of ["sm", "lg"] as const) {
      const html = renderToStaticMarkup(<EntryRow entry={entry} theme={METRIC_THEMES.peak} size={size} />)
      expect(html).toMatch(/<span[^>]*data-entity-kind="guild"[^>]*>&lt;Raiders&gt;<\/span>/)
      expect(html).toContain('&quot;id&quot;:&quot;guild-1&quot;')
      expect(html).toContain('data-entity-kind="character"')
      const withoutID = renderToStaticMarkup(<EntryRow entry={{ ...entry, guildId: undefined }} theme={METRIC_THEMES.peak} size={size} />)
      expect(withoutID).toContain("&lt;Raiders&gt;")
      expect(withoutID).not.toContain('data-entity-kind="guild"')
    }
  })

  it("marks published character and guild names for Alt+click", () => {
    const character = renderToStaticMarkup(<EntryRow entry={{ id: "one", name: "Raider", realm: "Turtle", guid: "Player-1", cls: "MAGE", spec: "Fire", subSpec: "", score: 10, detail: "Turtle" }} theme={METRIC_THEMES.peak} size="sm" />)
    const guild = renderToStaticMarkup(<GuildName guild="Raiders" guildId="guild-1" />)
    expect(character).toContain('data-entity-kind="character"')
    expect(character).toContain('&quot;guid&quot;:&quot;Player-1&quot;')
    expect(guild).toContain('data-entity-kind="guild"')
    expect(guild).toContain('&quot;id&quot;:&quot;guild-1&quot;')
  })
})
