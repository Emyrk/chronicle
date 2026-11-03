import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { EncounterSidebar } from "./EncounterSidebar"
import { FULL_CLEAR } from "./encounterSelection"

describe("live encounter sidebar", () => {
  it("does not offer unsupported combined-boss ratings", () => {
    const html = renderToStaticMarkup(<EncounterSidebar bosses={["Gri'lek", "Hazza'rah"]} optional={new Set()} selection={FULL_CLEAR} onSelect={vi.fn()} allowCombine={false} />)
    expect(html).toContain("Full clear")
    expect(html).toContain("Show Gri&#x27;lek ratings")
    expect(html).not.toContain("All bosses")
    expect(html).not.toContain("Ctrl+Click")
  })
})
