import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { GuideUiScene } from "./GuideUiScene"
import { applySceneBatch, createInitialScene, UI_ROOT_ID } from "./scene"
import { dragToTimeRange, PanelTimeRangeContext } from "./panelTimeRange"

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

  it("renders canvas shapes as SVG in the canvas's own pixel space", () => {
    const scene = applySceneBatch(createInitialScene(), [{
      op: "create",
      id: "radar",
      kind: "canvas",
      parentId: UI_ROOT_ID,
      props: {
        x: 0, y: 0, width: 400, height: 300, anchor: "top-left",
        shapes: [
          { kind: "circle", x: 200, y: 150, r: 100, stroke: "#8c94a8", width: 1, alpha: 0.3 },
          { kind: "arc", x: 200, y: 150, r: 120, from: -0.5, to: 0.5, width: 6, color: "#3b7cff", cap: "round", glow: 4 },
          { kind: "pie", x: 250, y: 100, r: 8, value: 0.6, color: "#c79c6e", track: "#c79c6e40" },
          { kind: "line", x1: 200, y1: 150, x2: 250, y2: 100, width: 2, color: "#4fd38a", dash: 6, gap: 4, offset: 2 },
          { kind: "text", x: 260, y: 100, text: "Thorvald", align: "left" },
          { kind: "icon", x: 200, y: 150, r: 30, icon: "spell_nature_healingwavelesser" },
        ],
      },
    }])

    const markup = renderToStaticMarkup(<GuideUiScene scene={scene} assets={new Map()} onNodeClick={() => {}} />)

    expect(markup).toContain('viewBox="0 0 400 300"')
    expect(markup).toContain('<circle cx="200" cy="150" r="100" fill="none" stroke="#8c94a8"')
    expect(markup).toContain('stroke-linecap="round"')
    expect(markup).toContain("drop-shadow")
    expect(markup).toContain('stroke-dasharray="6 4"')
    expect(markup).toContain(">Thorvald</text>")
    expect(markup).toContain("spell_nature_healingwavelesser.webp")
    expect(markup).toMatch(/<clipPath id="lua-canvas-[^"]+-5">/)
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

  it("renders linked text and buttons as links to the path, and disabled buttons as buttons", () => {
    const scene = applySceneBatch(createInitialScene(), [
      { op: "create", id: "about", kind: "text", parentId: UI_ROOT_ID, props: { x: 0, y: 0, anchor: "top-left", text: "About", fontSize: 12, color: "#ffffff", href: "/modules/chronicle/demo" } },
      { op: "create", id: "go", kind: "button", parentId: UI_ROOT_ID, props: { x: 0, y: 0, width: 80, height: 20, anchor: "top-left", text: "Go", href: "/modules/api" } },
      { op: "create", id: "off", kind: "button", parentId: UI_ROOT_ID, props: { x: 0, y: 0, width: 80, height: 20, anchor: "top-left", text: "Off", enabled: false, href: "/modules/api" } },
    ])
    const markup = renderToStaticMarkup(<GuideUiScene scene={scene} assets={new Map()} onNodeClick={() => {}} />)
    expect(markup).toMatch(/<a href="\/modules\/chronicle\/demo" data-guide-node="about"[^>]*pointer-events:auto/)
    expect(markup).toMatch(/<a href="\/modules\/api" data-guide-node="go"/)
    expect(markup).toMatch(/<button data-guide-node="off"[^>]*disabled/)
  })

  it("centres a button's label in its box without padding", () => {
    const scene = applySceneBatch(createInitialScene(), [
      { op: "create", id: "small", kind: "button", parentId: UI_ROOT_ID, props: { x: 0, y: 0, width: 24, height: 24, anchor: "top-left", text: "?" } },
      { op: "create", id: "link", kind: "button", parentId: UI_ROOT_ID, props: { x: 0, y: 0, width: 24, height: 24, anchor: "top-left", text: "?", href: "/modules/api" } },
    ])
    const markup = renderToStaticMarkup(<GuideUiScene scene={scene} assets={new Map()} onNodeClick={() => {}} />)
    for (const tag of [/<button data-guide-node="small"[^>]*>/, /<a href="\/modules\/api" data-guide-node="link"[^>]*>/]) {
      const element = markup.match(tag)?.[0] ?? ""
      expect(element).toMatch(/inline-flex items-center justify-center whitespace-nowrap/)
      expect(element).not.toMatch(/px-3|py-1/)
    }
  })

  it("highlights the page time range on selectable line charts only", () => {
    const chart = (id: string, timeSelection: string) => ({
      op: "create" as const, id, kind: "line-chart" as const, parentId: UI_ROOT_ID,
      props: { x: 0, y: 0, width: 480, height: 240, anchor: "top-left", timeSelection, series: [{ name: "Raid", points: [{ x: 0, y: 0 }, { x: 100, y: 10 }] }] },
    })
    const scene = applySceneBatch(createInitialScene(), [chart("on", "seconds"), chart("off", "off")])
    const markup = renderToStaticMarkup(
      <PanelTimeRangeContext.Provider value={{ range: { startMs: 20_000, endMs: 50_000 }, select: () => {} }}>
        <GuideUiScene scene={scene} assets={new Map()} onNodeClick={() => {}} />
      </PanelTimeRangeContext.Provider>,
    )
    expect(markup.match(/data-line-chart-selection/g)).toHaveLength(1)
    expect(markup).toMatch(/data-guide-node="on".*data-line-chart-selection/s)
    expect(markup).toContain("cursor:crosshair")
  })

  it("converts a drag across fight time into a page range", () => {
    expect(dragToTimeRange(50, 20, 1000)).toEqual({ startMs: 20_000, endMs: 50_000 })
    expect(dragToTimeRange(-3, 1.5, 1000)).toEqual({ startMs: 0, endMs: 1500 })
    expect(dragToTimeRange(1200, 4000.4, 1)).toEqual({ startMs: 1200, endMs: 4000 })
    expect(dragToTimeRange(7, 7, 1000)).toBeUndefined()
  })
})
