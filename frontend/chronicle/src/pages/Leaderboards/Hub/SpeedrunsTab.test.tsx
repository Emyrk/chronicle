import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { SpeedrunsTab, type RunsBoard } from "./SpeedrunsTab"

function board(view: "clear" | "kills", options: { runsBoard?: RunsBoard; locked?: boolean; bosses?: string[] } = {}) {
  const bosses = options.bosses ?? ["Ragnaros"]
  return renderToStaticMarkup(
    <SpeedrunsTab instanceName="Molten Core" bosses={bosses} selection={{ kind: "bosses", bosses }}
      view={view} runsBoard={options.runsBoard} allRunsLocked={options.locked} onRunsBoard={vi.fn()}
      live={{ clears: { entries: [] }, kills: { entries: [] } }} />,
  )
}

describe("speedrun run ranking toggle", () => {
  it("defaults to guild best and offers all runs even on an empty board", () => {
    const markup = board("clear")
    expect(markup).toContain('aria-label="Run ranking"')
    expect(markup).toMatch(/aria-checked="true"[^>]*>Guild best/)
    expect(markup).toMatch(/aria-checked="false"[^>]*>All runs/)
  })

  it("marks all runs as selected", () => {
    expect(board("clear", { runsBoard: "all" })).toMatch(/aria-checked="true"[^>]*>All runs/)
  })

  it("offers the toggle on a single boss's kill times", () => {
    expect(board("kills")).toContain('aria-label="Run ranking"')
  })

  it("does not offer the toggle on several bosses' kill times", () => {
    expect(board("kills", { bosses: ["Lucifron", "Ragnaros"] })).not.toContain('aria-label="Run ranking"')
  })

  it("turns all runs into a Revered upsell when locked", () => {
    const markup = board("clear", { locked: true })
    expect(markup).toContain('href="/supporter"')
    expect(markup).toContain("Revered")
    expect(markup).not.toMatch(/role="radio"[^>]*>All runs/)
  })
})
