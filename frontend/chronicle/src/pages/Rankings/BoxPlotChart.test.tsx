import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { BoxPlotChart } from "./BoxPlotChart"

describe("BoxPlotChart entities", () => {
  it("marks class icons and spec rows for Alt inspection with contextual stats", () => {
    const html = renderToStaticMarkup(
      <BoxPlotChart
        stats={[
          {
            player_class: "MAGE",
            player_spec: "Fire",
            min_dps: 100,
            q1_dps: 200,
            median_dps: 300,
            q3_dps: 400,
            max_dps: 500,
            count: 42,
          },
        ]}
      />,
    )

    expect(html).toContain('data-entity-kind="class"')
    expect(html).toContain('data-entity-kind="spec"')
    expect(html).toContain("Fire Mage")
    expect(html).toContain("Typical")
    expect(html).toContain("42")
  })
})
