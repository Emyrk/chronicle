import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { SpreadsView } from "./SpreadsView"

describe("SpreadsView entities", () => {
  it("marks class controls and spec rows for Alt inspection with parse stats", () => {
    const html = renderToStaticMarkup(
      <SpreadsView
        spreads={[
          {
            encounter_name: "Ragnaros",
            difficulty_name: "Normal",
            max_players: 40,
            player_class: "MAGE",
            player_spec: "Fire",
            sample_size: 42,
            status: "ok",
            min: 100,
            median: 300,
            max: 500,
            cutoffs: [{ floor: 95, value: 450 }],
          },
        ]}
        hidden={new Set()}
        metricLabel="DPS"
        loading={false}
        showOffRole
        onShowOffRoleChange={vi.fn()}
        onHiddenChange={vi.fn()}
        onOpenSpec={vi.fn()}
      />,
    )

    expect(html).toContain('data-entity-kind="class"')
    expect(html).toContain('data-entity-kind="spec"')
    expect(html).toContain("Fire Mage")
    expect(html).toContain("Kills")
    expect(html).toContain("42")
  })
})
