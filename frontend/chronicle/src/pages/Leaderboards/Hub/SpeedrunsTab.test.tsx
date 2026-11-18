import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { SpeedrunsTab } from "./SpeedrunsTab"

function board(view: "clear" | "kills", clearBoard?: "guild" | "all") {
  return renderToStaticMarkup(
    <SpeedrunsTab instanceName="Molten Core" bosses={["Ragnaros"]} selection={{ kind: "clear" }}
      view={view} clearBoard={clearBoard} onClearBoard={vi.fn()}
      live={{ clears: { entries: [] }, kills: { entries: [] } }} />,
  )
}

describe("speedrun full-clear ranking option", () => {
  it("defaults to guild best and offers all runs even on an empty board", () => {
    const markup = board("clear")
    expect(markup).toContain('aria-label="Full clear ranking"')
    expect(markup).toContain('<option value="guild" selected="">Guild best</option>')
    expect(markup).toContain('<option value="all">All runs</option>')
  })

  it("marks all runs as selected", () => {
    expect(board("clear", "all")).toContain('<option value="all" selected="">All runs</option>')
  })

  it("does not offer the full-clear option on kill times", () => {
    expect(board("kills")).not.toContain('aria-label="Full clear ranking"')
  })
})
