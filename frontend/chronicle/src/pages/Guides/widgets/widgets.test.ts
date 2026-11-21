import { describe, expect, it } from "vitest"
import { applySceneBatch, createInitialScene } from "../protocol/scene"
import { NODE_KINDS, type SceneOperation } from "../protocol/types"
import { createGuideRuntime } from "../runtime/runtime"
import { WIDGET_DEFINITIONS_BEGIN, WIDGET_DEFINITIONS_END, WIDGETS, widgetArgs, widgetLuaDefinitions } from "."
import type { WidgetSpec } from "./types"
import definitions from "../../LuaProjects/lua-panel-api.d.lua?raw"

/**
 * Contract tests every widget gets for free. A new spec, setter or option type is exercised here
 * through its `example`, so most additions need no hand-written tests.
 */

function run(source: string) {
  const runtime = createGuideRuntime({ entrypoint: "main.lua", sources: { "main.lua": source }, capabilities: ["ui"], panelStreams: ["damage"] })
  try {
    const operations = runtime.start()
    // Every widget operation must pass the scene's validation, the worker/page trust boundary.
    applySceneBatch(createInitialScene(), operations)
    return operations
  } finally { runtime.stop() }
}

const setterCases = WIDGETS.flatMap((spec: WidgetSpec) => spec.setters.map((setter) => [spec.luaType, setter.method, spec, setter] as const))

describe("widget specs", () => {
  it("are consistent", () => {
    const luaTypes = new Set<string>(), helpers = new Set<string>()
    for (const spec of WIDGETS as readonly WidgetSpec[]) {
      expect(NODE_KINDS).toContain(spec.kind)
      expect(luaTypes.has(spec.luaType) || helpers.has(spec.helper)).toBe(false)
      luaTypes.add(spec.luaType); helpers.add(spec.helper)
      // Each prop belongs to exactly one setter argument.
      const args = spec.setters.flatMap((setter) => setter.args)
      expect(widgetArgs(spec).size).toBe(args.length)
      for (const prop of [...Object.keys(spec.defaults), ...spec.required]) expect(widgetArgs(spec).has(prop)).toBe(true)
    }
  })

  it.each(setterCases)("%s:%s accepts its example arguments and emits only its props", (luaType, method, spec, setter) => {
    const args = setter.args.map((arg) => arg.type.example).join(", ")
    const operations = run(`CreateFrame("${luaType}", "w"):${method}(${args})`)
    const set = operations.find((operation): operation is Extract<SceneOperation, { op: "set" }> => operation.op === "set" && operation.id === "w")
    expect(Object.keys(set?.props ?? {}).sort()).toEqual(setter.args.map((arg) => arg.prop).sort())
    expect(operations[0]).toMatchObject({ op: "create", kind: spec.kind })
  })

  it.each(setterCases.filter(([, , , setter]) => setter.args.every((arg) => arg.type.optional)))("%s:%s works with every argument omitted", (luaType, method) => {
    expect(() => run(`CreateFrame("${luaType}", "w"):${method}()`)).not.toThrow()
  })

  it.each(setterCases.filter(([, , , setter]) => setter.args.some((arg) => !arg.type.optional)))("%s:%s rejects a missing required argument", (luaType, method) => {
    expect(() => run(`CreateFrame("${luaType}", "w"):${method}()`)).toThrow()
  })

  it.each(setterCases)("%s:%s is not available on plain frames", (_luaType, method) => {
    expect(() => run(`CreateFrame("Frame", "f"):${method}()`)).toThrow(new RegExp(`${method} is not supported for frame`))
  })

  it.each(WIDGETS.map((spec) => [spec.helper, spec] as const))("ui.%s applies every option", (helper, spec) => {
    const options = spec.setters.flatMap((setter) => setter.args.map((arg) => `${arg.prop} = ${arg.type.example}`))
    const operations = run(`require("chronicle.v1.ui").${helper}(UIParent, "w", { x = 4, y = -8, width = 300, height = 200, ${options.join(", ")} })`)
    const props = Object.assign({}, ...operations.filter((operation) => operation.op === "set" && operation.id === "w").map((operation) => (operation as { props: object }).props))
    for (const arg of spec.setters.flatMap((setter) => setter.args)) expect(props).toHaveProperty(arg.prop)
    expect(props).toMatchObject({ x: 4, y: -8, width: 300, height: 200 })
  })
})

describe("generated LuaLS definitions", () => {
  // pnpm generate:lua-api runs this with -u, which rewrites the file instead of failing.
  it("lua-panel-api.d.lua matches the widget specs", async () => {
    const start = definitions.indexOf(WIDGET_DEFINITIONS_BEGIN)
    const end = definitions.indexOf(WIDGET_DEFINITIONS_END)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    const next = definitions.slice(0, start) + widgetLuaDefinitions() + definitions.slice(end + WIDGET_DEFINITIONS_END.length)
    await expect(next, "Widget definitions are stale. Run pnpm generate:lua-api.").toMatchFileSnapshot("../../LuaProjects/lua-panel-api.d.lua")
  })
})
