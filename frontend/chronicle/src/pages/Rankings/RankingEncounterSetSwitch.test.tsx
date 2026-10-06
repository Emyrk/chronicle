import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { RankingEncounterSetSwitch } from "./RankingEncounterSetSwitch"

const sets = [
  { id: "", label: "Normal", encounters: ["Erennius", "Solnius"] },
  { id: "hard", label: "Hard Mode", encounters: ["Solnius (Hard Mode)"] },
]

describe("RankingEncounterSetSwitch", () => {
  it("renders configured sets with the selected set exposed accessibly", () => {
    const markup = renderToStaticMarkup(
      <RankingEncounterSetSwitch sets={sets} value="hard" onChange={() => undefined} />,
    )

    expect(markup.indexOf("Normal")).toBeLessThan(markup.indexOf("Hard Mode"))
    expect(markup).toContain('aria-label="Ranking encounter set"')
    expect(markup).toContain('aria-pressed="false"')
    expect(markup).toContain('aria-pressed="true"')
  })
})
