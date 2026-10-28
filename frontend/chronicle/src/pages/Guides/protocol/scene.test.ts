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
    ["unit", { x: 0.5, y: 0.5, size: 20, unit: "boss" }],
    ["icon", { x: 0.5, y: 0.5, size: 20, asset: "icon.png" }],
    ["map-text", { x: 0.5, y: 0.5, text: "Stack", fontSize: 12, color: "#ffffff" }],
    ["line", { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#fff", width: 2 }],
    ["arrow", { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#fff", width: 2, headSize: 8 }],
    ["circle", { x: 0.5, y: 0.5, radius: 0.2, color: "#ff000080", width: 2 }],
    ["cone", { x: 0.5, y: 0.5, radius: 0.2, facing: Math.PI, angle: Math.PI / 2, color: "#fff", width: 2 }],
    ["polygon", { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }], color: "#fff", width: 2 }],
  ] as const)("accepts the %s node kind", (kind, props) => {
    const parentId = ["frame", "text", "texture", "button"].includes(kind) ? UI_ROOT_ID : null
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
