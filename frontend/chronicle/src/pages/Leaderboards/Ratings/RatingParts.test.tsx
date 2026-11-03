import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ClassIcon } from "@/pages/RaidPlanner/ClassIcon"
import { EntryRow, SpecIcon } from "./RatingParts"
import { METRIC_THEMES } from "./ratingThemes"

describe("published rating icons", () => {
  it("does not request an icon for all-class Renown rows", () => {
    const html = renderToStaticMarkup(<EntryRow entry={{ id: "one", name: "Raider", cls: "", spec: "", subSpec: "", score: 10, detail: "Realm" }} theme={METRIC_THEMES.renown} size="sm" />)
    expect(html).toContain("Raider")
    expect(html).not.toContain("/c/icons/")
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
})
