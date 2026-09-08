import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { KillTimeTable } from "./KillTimeTable"
import { RankingsTable } from "./RankingsTable"

function render(content: ReactNode) {
  return renderToStaticMarkup(<MemoryRouter>{content}</MemoryRouter>)
}

describe("rankings loading states", () => {
  it("shows loading instead of the player leaderboard empty state", () => {
    const markup = render(<RankingsTable entries={[]} loading />)

    expect(markup).toContain("Loading…")
    expect(markup).not.toContain("No records found")
  })

  it("shows loading instead of the kill time leaderboard empty state", () => {
    const markup = render(<KillTimeTable entries={[]} loading />)

    expect(markup).toContain("Loading…")
    expect(markup).not.toContain("No records found")
  })
})
