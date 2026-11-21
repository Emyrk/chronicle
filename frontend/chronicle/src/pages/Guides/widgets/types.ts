import type { lua as fengariLua } from "fengari"
import type { NodeKind } from "../protocol/types"

/**
 * Widgets are Chronicle-owned UI objects (charts, meters, ...) that Lua configures with setter
 * methods. One WidgetSpec describes a widget once; the Lua runtime, scene validation, the
 * chronicle.v1.ui helper, the LuaLS definitions and the contract tests are all derived from it.
 * Only the React renderer is written separately (see protocol/widgetRenderers.tsx).
 *
 * To add a widget: add its kind to NODE_KINDS, write a spec in this folder, list it in
 * widgets/index.ts, add a renderer, then run `pnpm generate:lua-api`.
 */

export type LuaState = object

/**
 * Lua helpers the runtime lends to option readers. Specs never import fengari themselves: scene
 * validation (main thread) imports the specs, and the Lua VM must stay in the worker bundle.
 */
export interface LuaReadContext {
  lua: typeof fengariLua
  toLuaString(value: string): Uint8Array
  /** Raise a Lua error. Never returns. */
  fail(state: LuaState, message: string): never
  /** A Lua string argument or value at `index`, bounded by the runtime's string limit. */
  string(state: LuaState, index: number, label: string): string
  /** A Lua number argument at `index`. */
  number(state: LuaState, index: number): number
}

/**
 * One kind of value a widget setter accepts. It knows how to read itself from Lua, how to
 * validate the result inside the scene (the trust boundary for worker output), how to describe
 * itself to LuaLS, and an example used by the contract tests.
 */
export interface OptionType<T = unknown> {
  /** LuaLS type written in the generated definitions, e.g. "boolean" or "ChronicleLineSeries[]". */
  luaType: string
  /** Whether Lua may omit this argument (read() then returns the type's own fallback). */
  optional: boolean
  read(context: LuaReadContext, state: LuaState, index: number, label: string): T
  /** Throws SceneValidationError when a worker sends an invalid value. */
  validate(value: unknown, label: string): void
  /** Extra LuaLS lines (aliases, classes) this type needs; deduplicated across widgets. */
  definitions?: string
  /** A Lua expression for this argument, used by the contract tests and docs. */
  example: string
}

export interface WidgetArg {
  /** Scene property the argument is stored in. Also the ui helper option name. */
  prop: string
  type: OptionType
  /** Shown after the parameter in the LuaLS definitions. */
  doc?: string
}

export interface WidgetSetter {
  /** Lua method name, e.g. "SetCurve". */
  method: string
  args: readonly WidgetArg[]
  doc: string
}

export interface WidgetSpec<K extends NodeKind = NodeKind> {
  kind: K
  /** Name passed to CreateFrame, e.g. "LineChart". */
  luaType: string
  /** chronicle.v1.ui helper name, e.g. "lineChart". */
  helper: string
  /** LuaLS class name, e.g. "ChronicleLineChart". */
  luaClass: string
  doc: string
  /** Size used when neither SetSize nor the helper gives one. */
  defaultSize: { width: number; height: number }
  /** Initial values for widget props, sent with the create operation. */
  defaults: Readonly<Record<string, unknown>>
  /** Widget props a create operation must include. Layout props are always required. */
  required: readonly string[]
  setters: readonly WidgetSetter[]
}

/** Keeps a spec's literal kind so WidgetKind (and the renderer map keyed by it) is exact. */
export function defineWidget<K extends NodeKind>(spec: WidgetSpec<K>): WidgetSpec<K> {
  return spec
}
