import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { GuideUiScene } from "./GuideUiScene"
import { applySceneBatch, createInitialScene, UI_ROOT_ID } from "./scene"

describe("GuideUiScene", () => {
  it("renders host-owned player metric chart nodes with Chronicle's chart component", () => {
    const scene = applySceneBatch(createInitialScene(), [{
      op: "create",
      id: "damage-chart",
      kind: "player-metric-chart",
      parentId: UI_ROOT_ID,
      props: {
        x: 0,
        y: 0,
        width: 480,
        height: 320,
        anchor: "top-left",
        type: "damage",
        perSecond: true,
        durationMillis: 60_000,
        data: [{
          playerID: "p1",
          playerName: "Jaina",
          className: "MAGE",
          specialization: "Frost",
          value: 120_000,
        }],
      },
    }])

    const markup = renderToStaticMarkup(
      <GuideUiScene scene={scene} assets={new Map()} onNodeClick={() => {}} />,
    )

    expect(markup).toContain('data-guide-node="damage-chart"')
    expect(markup).toContain("data-player-metric-chart")
    expect(markup).toContain("Jaina")
    expect(markup).toContain("class_mage.png")
  })
})
