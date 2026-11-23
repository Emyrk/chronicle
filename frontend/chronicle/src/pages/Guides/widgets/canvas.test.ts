import { describe, expect, it } from "vitest"
import { applySceneBatch, createInitialScene } from "../protocol/scene"
import { arcPath, piePath } from "../protocol/canvasGeometry"
import type { SceneOperation } from "../protocol/types"
import { createGuideRuntime } from "../runtime/runtime"
import { MAX_CANVAS_SHAPES } from "./canvas"

function run(source: string) {
  const runtime = createGuideRuntime({ entrypoint: "main.lua", sources: { "main.lua": source }, capabilities: ["ui"], panelStreams: ["damage"] })
  try {
    const operations = runtime.start()
    applySceneBatch(createInitialScene(), operations)
    return operations
  } finally { runtime.stop() }
}

function shapesOf(operations: SceneOperation[]) {
  const set = operations.find((operation): operation is Extract<SceneOperation, { op: "set" }> => operation.op === "set" && operation.id === "c")
  return set?.props.shapes
}

const setShapes = (shapes: string) => run(`CreateFrame("Canvas", "c"):SetShapes({ ${shapes} })`)

describe("Canvas:SetShapes", () => {
  it("stores shapes with colors as hex, kinds in their canonical case, and omits unset optional fields", () => {
    expect(shapesOf(setShapes(`{ kind = "Circle", x = 1, y = 2, r = 3, stroke = {1, 0, 0, 0.5} }`))).toEqual([
      { kind: "circle", x: 1, y: 2, r: 3, stroke: "#ff000080" },
    ])
  })

  it("rejects unknown kinds and fields", () => {
    expect(() => setShapes(`{ kind = "square", x = 0, y = 0 }`)).toThrow(/shape 1 kind must be one of circle, arc, pie, line, text, icon/)
    expect(() => setShapes(`{ kind = "circle", x = 0, y = 0, radius = 5 }`)).toThrow(/shape 1 \(circle\) has no field 'radius'/)
  })

  it("rejects missing required fields and out-of-range values", () => {
    expect(() => setShapes(`{ kind = "arc", x = 0, y = 0, r = 5, from = 0, to = 1, width = 2 }`)).toThrow(/needs color/)
    expect(() => setShapes(`{ kind = "pie", x = 0, y = 0, r = 5, value = 1.5, color = "#fff" }`)).toThrow(/value must be between 0 and 1/)
    expect(() => setShapes(`{ kind = "text", x = 0, y = 0, text = "a\\nb" }`)).toThrow(/must be one line/)
    expect(() => setShapes(`{ kind = "icon", x = 0, y = 0, r = 5, icon = "../x" }`)).toThrow(/letters, numbers/)
  })

  it(`allows at most ${MAX_CANVAS_SHAPES} shapes`, () => {
    expect(() => run(`local s = {} for i = 1, ${MAX_CANVAS_SHAPES + 1} do s[i] = { kind = "circle", x = 0, y = 0, r = 1 } end CreateFrame("Canvas", "c"):SetShapes(s)`))
      .toThrow(new RegExp(`at most ${MAX_CANVAS_SHAPES}`))
  })
})

describe("canvas scene validation", () => {
  // A canvas created by Lua, then a forged update straight from the worker.
  const scene = (shapes: unknown) => applySceneBatch(createInitialScene(), [
    ...run(`CreateFrame("Canvas", "c")`),
    { op: "set", id: "c", props: { shapes } },
  ])

  it("rejects worker output that Lua could not have produced", () => {
    expect(() => scene([{ kind: "circle", x: 0, y: 0, r: 1, onclick: "x" }])).toThrow()
    expect(() => scene([{ kind: "circle", x: 0, y: 0 }])).toThrow(/r is required/)
    expect(() => scene([{ kind: "line", x1: 0, y1: 0, x2: 1, y2: 1, width: 1, color: "red" }])).toThrow()
    expect(() => scene([{ kind: "icon", x: 0, y: 0, r: 1, icon: "https://example.com/x" }])).toThrow()
  })

  it("accepts valid shapes", () => {
    expect(() => scene([{ kind: "pie", x: 0, y: 0, r: 1, value: 0.5, color: "#ffffff" }])).not.toThrow()
  })
})

describe("canvas geometry", () => {
  it("draws arcs clockwise when to > from and takes the long way past half a turn", () => {
    expect(arcPath(0, 0, 10, 0, Math.PI / 2)).toMatch(/^M 10 0 A 10 10 0 0 1 /)
    expect(arcPath(0, 0, 10, 0, -Math.PI / 2)).toMatch(/ 0 0 0 /)
    expect(arcPath(0, 0, 10, 0, 1.5 * Math.PI)).toMatch(/ 0 1 1 /)
  })

  it("starts a pie at its start angle and closes through the center", () => {
    expect(piePath(5, 5, 5, 0.25, -Math.PI / 2)).toMatch(/^M 5 5 L 5 0 A 5 5 0 0 1 10 5.*Z$/)
  })
})
