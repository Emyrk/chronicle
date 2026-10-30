import { describe, expect, it } from "vitest"
import {
  applySceneBatch,
  createInitialScene,
  MAX_NODES,
  MAX_OPERATIONS,
  SceneValidationError,
  UI_ROOT_ID,
} from "./scene"
import type { SceneOperation } from "./types"

const create = (id: string, kind: "frame" | "text" = "frame", parentId: string | null = UI_ROOT_ID): SceneOperation => ({
  op: "create",
  id,
  kind,
  parentId,
  props: kind === "frame" ? { x: 0, y: 0, width: 100, height: 100, anchor: "top-left" } : { x: 0, y: 0, text: "hello", fontSize: 14, color: "#ffffff", anchor: "top-left" },
})

describe("retained guide scene reducer", () => {
  it("applies create, set, listen, camera, and destroy in order without mutating the input", () => {
    const initial = createInitialScene()
    const next = applySceneBatch(initial, [
      create("panel"),
      create("label", "text", "panel"),
      { op: "set", id: "label", props: { text: "updated" } },
      { op: "listen", id: "label", event: "click", enabled: true },
      { op: "camera", x: 0.25, y: 0.75, zoom: 2 },
      { op: "chapter", chapter: "phase-one" },
    ])

    expect(initial.nodes.size).toBe(0)
    expect(next.nodes.get("label")?.props.text).toBe("updated")
    expect(next.nodes.get("label")?.listeners).toEqual(["click"])
    expect(next.camera).toEqual({ x: 0.25, y: 0.75, zoom: 2 })
    expect(next.chapter).toBe("phase-one")

    const destroyed = applySceneBatch(next, [{ op: "destroy", id: "panel" }])
    expect(destroyed.nodes.has("panel")).toBe(false)
    expect(destroyed.nodes.has("label")).toBe(false)
    expect(next.nodes.has("panel")).toBe(true)
  })

  it.each([
    ["frame", { x: 0, y: 0, width: 20, height: 20, anchor: "top-left" }],
    ["text", { x: 0, y: 0, text: "Text", fontSize: 14, color: "#fff", anchor: "center" }],
    ["texture", { x: 0, y: 0, width: 20, height: 20, asset: "icon.png", anchor: "center" }],
    ["button", { x: 0, y: 0, width: 80, height: 24, text: "Go", anchor: "bottom-right" }],
    ["player-metric-chart", { x: 0, y: 0, width: 320, height: 240, anchor: "top-left", type: "damage", data: [{ playerID: "p1", playerName: "Jaina", className: "MAGE", value: 42 }] }],
    ["unit", { x: 0.5, y: 0.5, size: 20, unit: "boss" }],
    ["icon", { x: 0.5, y: 0.5, size: 20, asset: "icon.png" }],
    ["map-text", { x: 0.5, y: 0.5, text: "Stack", fontSize: 12, color: "#ffffff" }],
    ["line", { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#fff", width: 2 }],
    ["arrow", { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#fff", width: 2, headSize: 8 }],
    ["circle", { x: 0.5, y: 0.5, radius: 0.2, color: "#ff000080", width: 2 }],
    ["cone", { x: 0.5, y: 0.5, radius: 0.2, facing: Math.PI, angle: Math.PI / 2, color: "#fff", width: 2 }],
    ["polygon", { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }], color: "#fff", width: 2 }],
  ] as const)("accepts the %s node kind", (kind, props) => {
    const parentId = ["frame", "text", "texture", "button", "player-metric-chart"].includes(kind) ? UI_ROOT_ID : null
    const next = applySceneBatch(createInitialScene(), [{ op: "create", id: `node-${kind}`, kind, parentId, props }])
    expect(next.nodes.get(`node-${kind}`)?.kind).toBe(kind)
  })

  it("rejects duplicate, unknown, and reserved IDs transactionally", () => {
    const initial = createInitialScene()
    expect(() => applySceneBatch(initial, [create("same"), create("same")])).toThrow(/duplicate ID/)
    expect(initial.nodes.size).toBe(0)
    expect(() => applySceneBatch(initial, [{ op: "set", id: "missing", props: { x: 1 } }])).toThrow(/unknown ID/)
    expect(() => applySceneBatch(initial, [{ ...create(UI_ROOT_ID), id: UI_ROOT_ID }])).toThrow(/reserved/)
  })

  it("rejects invalid and kind-inappropriate properties", () => {
    expect(() => applySceneBatch(createInitialScene(), [{ op: "create", id: "bad", kind: "frame", parentId: UI_ROOT_ID, props: { x: 0, y: 0, width: -1, height: 10, anchor: "top-left" } }])).toThrow(/width/)
    expect(() => applySceneBatch(createInitialScene(), [{ op: "create", id: "bad", kind: "circle", parentId: null, props: { x: 1.1, y: 0, radius: 0.2, color: "red", width: 2 } }])).toThrow(SceneValidationError)
    expect(() => applySceneBatch(createInitialScene(), [{ op: "create", id: "bad", kind: "frame", parentId: UI_ROOT_ID, props: { x: 0, y: 0, width: 10, height: 10, anchor: "top-left", facing: 1 } }])).toThrow(/unknown property/)
  })

  it("validates strings, colors, sizes, normalized coordinates, facing, points, and anchors", () => {
    const cases: SceneOperation[] = [
      { op: "create", id: "x".repeat(129), kind: "frame", parentId: UI_ROOT_ID, props: { x: 0, y: 0, width: 1, height: 1, anchor: "center" } },
      { op: "create", id: "color", kind: "text", parentId: UI_ROOT_ID, props: { x: 0, y: 0, text: "x", fontSize: 12, color: "blue", anchor: "center" } },
      { op: "create", id: "size", kind: "icon", parentId: null, props: { x: 0.5, y: 0.5, size: 0, asset: "x" } },
      { op: "create", id: "coord", kind: "unit", parentId: null, props: { x: -0.01, y: 0.5, size: 10, unit: "boss" } },
      { op: "create", id: "face", kind: "cone", parentId: null, props: { x: 0.5, y: 0.5, radius: 0.2, facing: Math.PI * 2 + 0.01, angle: 1, color: "#fff", width: 1 } },
      { op: "create", id: "points", kind: "polygon", parentId: null, props: { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#fff", width: 1 } },
      { op: "create", id: "anchor", kind: "frame", parentId: UI_ROOT_ID, props: { x: 0, y: 0, width: 1, height: 1, anchor: "near" } },
      { op: "chapter", chapter: "" },
    ]
    for (const operation of cases) expect(() => applySceneBatch(createInitialScene(), [operation])).toThrow(SceneValidationError)
  })

  it("allows empty and multi-line display text but not other control characters", () => {
    const label = (text: string): SceneOperation => ({ op: "create", id: "label", kind: "text", parentId: UI_ROOT_ID, props: { x: 0, y: 0, text, fontSize: 12, color: "#fff", anchor: "center" } })
    const scene = applySceneBatch(createInitialScene(), [label("Kicks:\n\tAlice 3")])
    expect(scene.nodes.get("label")?.props.text).toBe("Kicks:\n\tAlice 3")
    expect(applySceneBatch(scene, [{ op: "set", id: "label", props: { text: "" } }]).nodes.get("label")?.props.text).toBe("")
    expect(() => applySceneBatch(createInitialScene(), [label("bell\u0007")])).toThrow(SceneValidationError)
    expect(() => applySceneBatch(createInitialScene(), [label("x".repeat(4097))])).toThrow(SceneValidationError)
  })

  it("validates semantic texture sources and rejects URL or path injection", () => {
    const base = applySceneBatch(createInitialScene(), [{
      op: "create",
      id: "texture",
      kind: "texture",
      parentId: UI_ROOT_ID,
      props: { x: 0, y: 0, width: 24, height: 24, asset: "unset", textureType: "asset", tooltip: false, anchor: "top-left" },
    }])
    const spell = applySceneBatch(base, [{ op: "set", id: "texture", props: { textureType: "spell", textureId: 116, tooltip: true } }])
    expect(spell.nodes.get("texture")?.props).toMatchObject({ textureType: "spell", textureId: 116, tooltip: true })
    const icon = applySceneBatch(spell, [{ op: "set", id: "texture", props: { textureType: "icon", iconName: "inv_sword_39", tooltip: false } }])
    expect(icon.nodes.get("texture")?.props.iconName).toBe("inv_sword_39")

    for (const props of [
      { textureType: "url" },
      { textureId: 0 },
      { textureId: 1.5 },
      { iconName: "../secret" },
      { iconName: "https://evil.example/x" },
      { iconName: "a".repeat(129) },
      { asset: "../secret.png" },
      { asset: "https://evil.example/x.png" },
      { tooltip: "yes" },
    ]) expect(() => applySceneBatch(base, [{ op: "set", id: "texture", props }])).toThrow(SceneValidationError)
  })

  it("validates player metric chart rows and options", () => {
    const chart = {
      op: "create" as const,
      id: "chart",
      kind: "player-metric-chart" as const,
      parentId: UI_ROOT_ID,
      props: {
        x: 0, y: 0, width: 400, height: 300, anchor: "top-left",
        type: "healing", perSecond: true, durationMillis: 60_000, rowHeight: 30,
        data: [{ playerID: "p1", playerName: "Jaina", className: "MAGE", specialization: "Frost", value: 42, stackedValue: 5, dimmed: false }],
      },
    }
    expect(() => applySceneBatch(createInitialScene(), [chart])).not.toThrow()
    expect(() => applySceneBatch(createInitialScene(), [{ ...chart, props: { ...chart.props, type: "threat" } }])).toThrow(/type/)
    expect(() => applySceneBatch(createInitialScene(), [{ ...chart, props: { ...chart.props, data: [{ playerID: "p1", playerName: "Jaina", className: "MAGE", specialization: "", value: -1 }] } }])).toThrow(/value/)
    expect(() => applySceneBatch(createInitialScene(), [{ ...chart, props: { ...chart.props, data: [{ playerID: "p1", playerName: "Jaina", className: "MAGE", specialization: "", value: 1, breakout: "no" }] } }])).toThrow(/unknown property/)
    expect(() => applySceneBatch(createInitialScene(), [{ ...chart, props: { ...chart.props, data: Array.from({ length: 101 }, (_, index) => ({ playerID: `p${index}`, playerName: "Player", className: "MAGE", specialization: "", value: 1 })) } }])).toThrow(/100 rows/)
  })

  it("rejects parent cycles and excessive nesting", () => {
    const scene = applySceneBatch(createInitialScene(), [create("a"), create("b", "frame", "a")])
    expect(() => applySceneBatch(scene, [{ op: "set", id: "a", parentId: "b", props: {} }])).toThrow(/cycle/)

    const operations: SceneOperation[] = []
    let parent = UI_ROOT_ID
    for (let index = 0; index < 65; index += 1) {
      const id = `nested-${index}`
      operations.push(create(id, "frame", parent))
      parent = id
    }
    expect(() => applySceneBatch(createInitialScene(), operations)).toThrow(/nesting/)
    expect(scene.nodes.size).toBe(2)
  })

  it("enforces node and operation limits", () => {
    expect(() => applySceneBatch(createInitialScene(), Array.from({ length: MAX_OPERATIONS + 1 }, (_, index) => ({ op: "camera", x: 0.5, y: 0.5, zoom: 1 + index / 10_000 })))).toThrow(/operations/)

    const scene = createInitialScene()
    const operations = Array.from({ length: MAX_NODES }, (_, index) => ({
      op: "create" as const,
      id: `icon-${index}`,
      kind: "icon" as const,
      parentId: null,
      props: { x: 0.5, y: 0.5, size: 1, asset: "x" },
    }))
    const full = applySceneBatch(scene, operations)
    expect(() => applySceneBatch(full, [{ op: "create", id: "too-many", kind: "icon", parentId: null, props: { x: 0.5, y: 0.5, size: 1, asset: "x" } }])).toThrow(/nodes/)
  })

  it("safely clones operation values", () => {
    const points = [{ x: 0, y: 0 }, { x: 1, y: 1 }]
    const scene = applySceneBatch(createInitialScene(), [{ op: "create", id: "line", kind: "line", parentId: null, props: { points, color: "#fff", width: 1 } }])
    points[0].x = 1
    expect(scene.nodes.get("line")?.props.points).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }])
  })
})
