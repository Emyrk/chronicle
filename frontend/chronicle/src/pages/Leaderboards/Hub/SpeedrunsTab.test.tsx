import { MemoryRouter } from "react-router-dom"
import { speedruns } from "./hub.fixtures"
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


describe("non-guild full clears", () => {
  it("labels non-guild runs in both the podium and the table", () => {
    const run = { ...speedruns(undefined, ["Ragnaros"], "Molten Core")[0],
      guild_id: "00000000-0000-0000-0000-000000000000", guild_name: "", guild_logo_url: "" }
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <SpeedrunsTab instanceName="Molten Core" bosses={["Ragnaros"]} selection={{ kind: "clear" }}
          runsBoard="all" live={{ clears: { entries: [run] } }} />
      </MemoryRouter>,
    )
    // Mobile and desktop podiums plus the table should all have a visible label.
    expect(markup.match(/>No guild</g)).toHaveLength(3)
    expect(markup).toContain("speedrun log for No guild")
    expect(markup).not.toContain('data-entity-kind="guild"')
  })
})


describe("full-clear pagination", () => {
  function pageMarkup(page: number, hasNextPage: boolean, empty = false) {
    const runs = speedruns(undefined, ["Ragnaros"], "Molten Core")
    return renderToStaticMarkup(
      <MemoryRouter>
        <SpeedrunsTab instanceName="Molten Core" bosses={["Ragnaros"]} selection={{ kind: "clear" }}
          clearPage={page} clearPageSize={50} onClearPage={vi.fn()} onRunsBoard={vi.fn()}
          live={{ clears: { entries: empty ? [] : runs.slice(0, 1), hasNextPage } }} />
      </MemoryRouter>,
    )
  }

  it("shows the podium on page one and enables only Next", () => {
    const markup = pageMarkup(1, true)
    expect(markup).toContain('aria-label="Full clear pages"')
    expect(markup).toMatch(/disabled=""[^>]*aria-label="Previous page"/)
    expect(markup).not.toMatch(/disabled=""[^>]*aria-label="Next page"/)
    expect(markup).toContain("sm:hidden")
  })

  it("starts page two at rank 51 without a podium and keeps the board toggle", () => {
    const markup = pageMarkup(2, false)
    expect(markup).toContain(">51</td>")
    expect(markup).toContain("Page 2")
    expect(markup).toContain('aria-label="Run ranking"')
    expect(markup).not.toContain("sm:hidden")
    expect(markup).toMatch(/disabled=""[^>]*aria-label="Next page"/)
    expect(markup).not.toMatch(/disabled=""[^>]*aria-label="Previous page"/)
  })

  it("allows returning from an empty later page", () => {
    const markup = pageMarkup(3, false, true)
    expect(markup).toContain("No speedruns found")
    expect(markup).toContain('aria-label="Previous page"')
    expect(markup).not.toMatch(/disabled=""[^>]*aria-label="Previous page"/)
  })
})
