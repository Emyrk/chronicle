import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { EncounterSidebar } from "./EncounterSidebar"
import { FULL_CLEAR, toggleEncounter } from "./encounterSelection"

const bosses = ["Lucifron", "Magmadar", "Ragnaros"]

describe("encounter sidebar", () => {
  it("shows the preset as every boss selected, with no Full clear entry", () => {
    const html = renderToStaticMarkup(<EncounterSidebar bosses={bosses} optional={new Set()} selection={FULL_CLEAR} onSelect={vi.fn()} />)
    expect(html).not.toContain("Full clear")
    expect(html).toContain("3 of 3 selected")
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(4) // three bosses and "All bosses"
  })

  it("selects only the configured preset while still listing other bosses", () => {
    const emeraldBosses = ["Erennius", "Solnius", "Solnius (Hard Mode)"]
    const html = renderToStaticMarkup(<EncounterSidebar bosses={emeraldBosses} preset={emeraldBosses.slice(0, 2)} optional={new Set()} selection={FULL_CLEAR} onSelect={vi.fn()} />)
    expect(html).toContain("2 of 2 selected")
    expect(html).toMatch(/aria-pressed="false"[^>]*title="Solnius \(Hard Mode\)\. Click to select, Ctrl\+Click to toggle"/)
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(3) // two preset bosses and "All bosses"
  })

  it("picks one on click and adds or removes one on Ctrl+Click", () => {
    expect(toggleEncounter(FULL_CLEAR, bosses, bosses, "Magmadar", false)).toEqual({ kind: "bosses", bosses: ["Magmadar"] })
    expect(toggleEncounter(FULL_CLEAR, bosses, bosses, "Magmadar", true)).toEqual({ kind: "bosses", bosses: ["Lucifron", "Ragnaros"] })
    const one = { kind: "bosses" as const, bosses: ["Ragnaros"] }
    expect(toggleEncounter(one, bosses, bosses, "Lucifron", true)).toEqual({ kind: "bosses", bosses: ["Lucifron", "Ragnaros"] })
    // Emptying, or getting back to every boss, is the preset again.
    expect(toggleEncounter(one, bosses, bosses, "Ragnaros", true)).toEqual(FULL_CLEAR)
    expect(toggleEncounter({ kind: "bosses", bosses: ["Lucifron", "Ragnaros"] }, bosses, bosses, "Magmadar", true)).toEqual(FULL_CLEAR)
  })
})
