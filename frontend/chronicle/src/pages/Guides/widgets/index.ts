import type { NodeKind } from "../protocol/types"
import { lineChartSpec } from "./lineChart"
import { playerMetricChartSpec } from "./playerMetricChart"
import type { WidgetArg, WidgetSetter, WidgetSpec } from "./types"

export type { WidgetSpec } from "./types"

/** Every Chronicle-owned widget. Order is the order of the generated docs. */
export const WIDGETS = [playerMetricChartSpec, lineChartSpec] as const

/** Node kinds rendered by a widget. GuideUiScene needs a renderer for each. */
export type WidgetKind = (typeof WIDGETS)[number]["kind"]

/** Layout props every widget supports through the shared region methods (SetPoint, SetSize, ...). */
export const WIDGET_LAYOUT_PROPS = ["x", "y", "width", "height", "anchor", "visible", "alpha", "zIndex"] as const
const REQUIRED_LAYOUT_PROPS = ["x", "y", "width", "height", "anchor"]

const byKind = new Map<NodeKind, WidgetSpec>(WIDGETS.map((spec) => [spec.kind, spec as WidgetSpec]))

export function widgetSpec(kind: NodeKind | "root"): WidgetSpec | undefined {
  return kind === "root" ? undefined : byKind.get(kind)
}

export function isWidgetKind(kind: NodeKind): kind is WidgetKind {
  return byKind.has(kind)
}

/** The setter argument that owns each widget prop. */
export function widgetArgs(spec: WidgetSpec): ReadonlyMap<string, WidgetArg> {
  return new Map(spec.setters.flatMap((setter) => setter.args.map((arg) => [arg.prop, arg] as const)))
}

/** Every prop a widget node may carry. */
export function widgetProps(spec: WidgetSpec): string[] {
  return [...WIDGET_LAYOUT_PROPS, ...widgetArgs(spec).keys()]
}

export function widgetRequiredProps(spec: WidgetSpec): string[] {
  return [...REQUIRED_LAYOUT_PROPS, ...spec.required]
}

export function widgetDefaultProps(spec: WidgetSpec): Record<string, unknown> {
  return { x: 0, y: 0, ...spec.defaultSize, anchor: "top-left", visible: true, ...structuredClone(spec.defaults) }
}

/** Setters grouped by Lua method name, so two widgets may share a name such as SetData. */
export function widgetSettersByMethod(): ReadonlyMap<string, ReadonlyMap<NodeKind, WidgetSetter>> {
  const result = new Map<string, Map<NodeKind, WidgetSetter>>()
  for (const spec of WIDGETS) for (const setter of spec.setters) {
    const kinds = result.get(setter.method) ?? new Map<NodeKind, WidgetSetter>()
    kinds.set(spec.kind, setter)
    result.set(setter.method, kinds)
  }
  return result
}

/**
 * Lua source for chronicle.v1.ui helpers: `ui.<helper>(parent, id, options)` creates the widget,
 * positions it from options.x/y/width/height and calls each setter whose options are present.
 */
export function widgetHelpersLua(): string {
  return WIDGETS.map((spec) => {
    const calls = spec.setters.map((setter) => {
      const present = setter.args.map((arg) => `options.${arg.prop} ~= nil`).join(" or ")
      const values = setter.args.map((arg) => `options.${arg.prop}`).join(", ")
      return `      if ${present} then widget:${setter.method}(${values}) end`
    })
    return `
    function M.${spec.helper}(parent, id, options)
      options = options or {}
      local widget = CreateFrame("${spec.luaType}", id, parent or UIParent)
      widget:SetPoint("TOPLEFT", parent or UIParent, "TOPLEFT", options.x or 0, options.y or 0)
      widget:SetSize(options.width or ${spec.defaultSize.width}, options.height or ${spec.defaultSize.height})
${calls.join("\n")}
      return widget
    end`
  }).join("\n")
}

/** Built-in CreateFrame types that are not widgets, with their LuaLS classes. */
const BASE_FRAME_TYPES: ReadonlyArray<readonly [string, string]> = [
  ["Frame", "ChronicleFrame"], ["FontString", "ChronicleFontString"], ["Texture", "ChronicleTexture"], ["Button", "ChronicleButton"],
]

export const WIDGET_DEFINITIONS_BEGIN = "-- BEGIN GENERATED WIDGET DEFINITIONS"
export const WIDGET_DEFINITIONS_END = "-- END GENERATED WIDGET DEFINITIONS"

/** LuaLS definitions for every widget plus CreateFrame; spliced into lua-panel-api.d.lua. */
export function widgetLuaDefinitions(): string {
  const lines = [WIDGET_DEFINITIONS_BEGIN, "-- Generated from src/pages/Guides/widgets. Run pnpm generate:lua-api after changing a widget spec.", ""]
  const definitions = new Set<string>()
  for (const spec of WIDGETS) for (const setter of spec.setters) for (const arg of setter.args) if (arg.type.definitions) definitions.add(arg.type.definitions)
  for (const definition of definitions) lines.push(definition, "")
  for (const spec of WIDGETS) {
    lines.push(`---${spec.doc}`, `---@class ${spec.luaClass}: ChronicleRegion`, `local ${spec.luaClass} = {}`, "")
    for (const setter of spec.setters) {
      lines.push(`---${setter.doc}`)
      for (const arg of setter.args) lines.push(`---@param ${arg.prop}${arg.type.optional ? "?" : ""} ${arg.type.luaType}${arg.doc ? ` ${arg.doc}` : ""}`)
      lines.push(`function ${spec.luaClass}:${setter.method}(${setter.args.map((arg) => arg.prop).join(", ")}) end`, "")
    }
  }
  const types = [...BASE_FRAME_TYPES, ...WIDGETS.map((spec) => [spec.luaType, spec.luaClass] as const)]
  lines.push(
    "---Create a retained UI object. parent defaults to UIParent.",
    `---@param frameType ${types.map(([type]) => JSON.stringify(type)).join("|")}`,
    "---@param id? string",
    "---@param parent? ChronicleFrame",
    `---@return ${types.map(([, luaClass]) => luaClass).join("|")} object`,
    "function CreateFrame(frameType, id, parent) end",
    "",
    WIDGET_DEFINITIONS_END,
  )
  return lines.join("\n")
}
