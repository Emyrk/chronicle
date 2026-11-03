import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { ParsingTab } from "./ParsingTab"

describe("ParsingTab published default cohort", () => {
  it("accepts size zero as an exact raid population", () => {
    const html = renderToStaticMarkup(<ParsingTab instanceName="Molten Core" allBosses={["Baron Geddon"]}
      selection={{ kind: "bosses", bosses: ["Baron Geddon"] }} scope={{}} role="dps" subject="guilds"
      onBoss={vi.fn()} onClear={vi.fn()} onScope={vi.fn()}
      live={{ difficulty: { key: "|0", difficultyName: "", maxPlayers: 0, sampleSize: 0 }, times: { status: "loading" } }} />)
    expect(html).toContain("Loading kill-time parses")
    expect(html).not.toContain("choose a boss and raid population")
  })
})
