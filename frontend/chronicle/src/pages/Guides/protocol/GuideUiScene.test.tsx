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

  it("renders line charts with series, legend and markers", () => {
    const scene = applySceneBatch(createInitialScene(), [{
      op: "create",
      id: "dps",
      kind: "line-chart",
      parentId: UI_ROOT_ID,
      props: {
        x: 0, y: 0, width: 480, height: 240, anchor: "top-left", xFormat: "seconds",
        series: [{ name: "Jaina", color: "#69ccf0", points: [{ x: 0, y: 0 }, { x: 10, y: 1500 }] }, { name: "Thrall", points: [{ x: 0, y: 5 }, { x: 10, y: 50 }] }],
        markers: [{ x: 5, label: "Phase 2" }],
      },
    }])

    const markup = renderToStaticMarkup(<GuideUiScene scene={scene} assets={new Map()} onNodeClick={() => {}} />)

    expect(markup).toContain('data-guide-node="dps"')
    expect(markup).toContain("data-line-chart")
    expect(markup).toContain("<svg")
    expect(markup).toContain("Jaina")
    expect(markup).toContain("Thrall")
    expect(markup).toContain("Phase 2")
    expect(markup).toContain("10s")
  })

  it("draws line chart bands and styled markers, and fills the parent when asked", () => {
    const scene = applySceneBatch(createInitialScene(), [{
      op: "create",
      id: "fight",
      kind: "line-chart",
      parentId: UI_ROOT_ID,
      props: {
        x: 10, y: -20, width: 480, height: 240, anchor: "top-left",
        series: [{ name: "Raid", suffix: "/s", points: [{ x: 0, y: 0 }, { x: 100, y: 5000 }] }],
        bands: [{ from: 0, to: 40, label: "Phase 1" }, { from: 40, to: 100, label: "Phase 2", color: "#6366f1" }],
        markers: [{ x: 60, label: "Wipe call", icon: "triangle", style: "dotted", color: "#ef4444", tooltip: "Jaina died" }],
      },
    }, {
      op: "create",
      id: "filled",
      kind: "line-chart",
      parentId: UI_ROOT_ID,
      props: { x: 10, y: -20, width: 480, height: 240, anchor: "top-left", series: [], fillParent: true },
    }])

    const markup = renderToStaticMarkup(<GuideUiScene scene={scene} assets={new Map()} onNodeClick={() => {}} />)

    expect(markup).toContain("Phase 1")
    expect(markup).toContain("Phase 2")
    expect(markup).toContain("Wipe call")
    expect(markup).toContain('stroke-dasharray="1 3"')
    expect(markup).toMatch(/<path d="M[\d.]+,0 L[\d.]+,0 L[\d.]+,7 Z" fill="#ef4444"/)
    expect(markup).toContain("data-line-chart-marker")
    expect(markup).toMatch(/data-guide-node="filled"[^>]*left:0;top:0;width:100%;height:100%/)
  })

  it("makes nodes with hover text receive the pointer", () => {
    const scene = applySceneBatch(createInitialScene(), [
      { op: "create", id: "plain", kind: "frame", parentId: UI_ROOT_ID, props: { x: 0, y: 0, width: 10, height: 10, anchor: "top-left" } },
      { op: "create", id: "hover", kind: "frame", parentId: UI_ROOT_ID, props: { x: 0, y: 0, width: 10, height: 10, anchor: "top-left", tooltipText: "Hello" } },
    ])

    const markup = renderToStaticMarkup(<GuideUiScene scene={scene} assets={new Map()} onNodeClick={() => {}} />)

    expect(markup).toMatch(/data-guide-node="plain"[^>]*pointer-events:none/)
    expect(markup).toMatch(/data-guide-node="hover"[^>]*pointer-events:auto/)
  })
})
