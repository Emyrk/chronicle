import { lauxlib, lua, lualib, to_luastring } from "fengari"
import { MAX_CANVAS_SIZE, UI_ROOT_ID } from "../protocol/scene"
import { sitePath } from "../protocol/validators"
import { isWidgetKind, WIDGETS, widgetDefaultProps, widgetProps, widgetSettersByMethod, widgetSpec } from "../widgets"
import type { LuaReadContext, WidgetSetter } from "../widgets/types"
import type { GuideCapability, NodeKind, SceneOperation } from "../protocol/types"
import { trustedLuaModule, isReservedLuaPath } from "./trustedModules"
import { PANEL_STREAMS, validatePanelEvent, type PanelEvent, type PanelStream } from "./panelEvents"
import type { PanelUnit, PanelUnits } from "./panelUnits"

const encoder = new TextEncoder()
const UI_KINDS = new Map<string, NodeKind>([["Frame", "frame"], ["FontString", "text"], ["Texture", "texture"], ["Button", "button"], ["Breakout", "breakout"], ...WIDGETS.map((spec) => [spec.luaType, spec.kind] as const)])
const WIDGET_SETTERS = widgetSettersByMethod()
const MAP_KINDS = new Map<string, NodeKind>([
  ["CreateUnit", "unit"], ["CreateUnitMarker", "unit"], ["CreateIcon", "icon"], ["CreateText", "map-text"],
  ["CreateLine", "line"], ["CreateArrow", "arrow"], ["CreateCircle", "circle"], ["CreateCone", "cone"], ["CreatePolygon", "polygon"],
])
const ANCHORS: Record<string, string> = {
  TOPLEFT: "top-left", TOP: "top", TOPRIGHT: "top-right", LEFT: "left", CENTER: "center",
  RIGHT: "right", BOTTOMLEFT: "bottom-left", BOTTOM: "bottom", BOTTOMRIGHT: "bottom-right",
}

/** A spell as Chronicle.GetSpell reports it. icon is a name SetIcon accepts. */
export interface PanelSpellInfo { id: number; name: string; rank?: string; icon?: string }

/** Spell lookups are fetched by the host, so they are bounded per run. */
export const MAX_SPELL_LOOKUPS = 1_000
const MAX_SPELL_WAITERS = 4_000

/** The page's time range filter, in ms from encounter start. A null bound is open. */
export interface PanelTimeRange { startMs: number | null; endMs: number | null }

export interface GuideRuntimeLimits {
  startupInstructions: number
  callbackInstructions: number
  instructionHookCount: number
  maxObjects: number
  maxOperations: number
  maxStringBytes: number
  maxTimers: number
  maxCallbacks: number
  maxTimerDelayMs: number
}

export interface GuideRuntimeOptions {
  entrypoint: string
  sources: Record<string, string>
  capabilities?: readonly GuideCapability[]
  // Panel mode grants only explicitly listed streams; guide mode has no Panel API.
  panelStreams?: readonly PanelStream[]
  /** Panel mode: units Lua can look up with Chronicle.GetUnit / Chronicle.GetPlayers. */
  units?: PanelUnits
  /** Host-compiled predicate, evaluated against the supplied Lua event message. */
  filter?: (message: Record<string, unknown>, eventIndex?: number) => boolean
  limits?: Partial<GuideRuntimeLimits>
  emitBatch?: (operations: SceneOperation[]) => void
  scheduleTimer?: (id: number, delayMs: number) => void
}

export interface GuideEvent { id: string; event: "click"; args?: unknown[] }

export class GuideLuaError extends Error {
  constructor(message: string) { super(message); this.name = "GuideLuaError" }
}

const DEFAULT_LIMITS: GuideRuntimeLimits = {
  startupInstructions: 250_000, callbackInstructions: 100_000, instructionHookCount: 100,
  maxObjects: 2_000, maxOperations: 2_000, maxStringBytes: 4_096, maxTimers: 128, maxCallbacks: 2_000, maxTimerDelayMs: 30_000,
}

type LuaState = object
type LuaFunction = (state: LuaState) => number
interface ObjectState { kind: NodeKind | "root"; shown: boolean; parentId: string | null }

const SUPPORTED_PROPS: Record<NodeKind, ReadonlySet<string>> = Object.fromEntries([
  ["frame", ["x", "y", "width", "height", "anchor", "visible", "alpha", "zIndex", "color", "backgroundColor", "borderColor", "tooltipText"]],
  ["text", ["x", "y", "width", "height", "anchor", "visible", "alpha", "zIndex", "text", "fontSize", "color", "align", "backgroundColor", "borderColor", "tooltipText", "href"]],
  ["texture", ["x", "y", "width", "height", "anchor", "visible", "alpha", "zIndex", "asset", "textureType", "textureId", "iconName", "tooltip", "tint", "borderColor", "tooltipText"]],
  ["button", ["x", "y", "width", "height", "anchor", "visible", "alpha", "zIndex", "text", "enabled", "color", "backgroundColor", "borderColor", "tooltipText", "href"]],
  ["breakout", ["width", "height", "visible", "alpha", "title", "anchorTo", "borderColor"]],
  ["unit", ["visible", "alpha", "x", "y", "size", "unit", "label", "color", "facing", "entry", "role"]],
  ["icon", ["visible", "alpha", "x", "y", "size", "asset", "label", "color", "facing"]],
  ["map-text", ["visible", "alpha", "x", "y", "text", "fontSize", "color", "align"]],
  ["line", ["visible", "alpha", "points", "color", "width"]],
  ["arrow", ["visible", "alpha", "points", "color", "width", "headSize"]],
  ["circle", ["visible", "alpha", "x", "y", "radius", "color", "fillColor", "width"]],
  ["cone", ["visible", "alpha", "x", "y", "radius", "facing", "angle", "color", "fillColor", "width"]],
  ["polygon", ["visible", "alpha", "points", "color", "fillColor", "width"]],
  ...WIDGETS.map((spec) => [spec.kind, widgetProps(spec)] as const),
].map(([kind, props]) => [kind, new Set(props)])) as Record<NodeKind, ReadonlySet<string>>

function defaultProps(kind: NodeKind): Record<string, unknown> {
  switch (kind) {
    case "frame": return { x: 0, y: 0, width: 1, height: 1, anchor: "center", visible: true }
    case "text": return { x: 0, y: 0, text: " ", fontSize: 14, color: "#ffffffff", anchor: "center", visible: true }
    case "texture": return { x: 0, y: 0, width: 1, height: 1, asset: "unset", textureType: "asset", tooltip: false, anchor: "center", visible: true }
    case "button": return { x: 0, y: 0, width: 1, height: 1, text: " ", anchor: "center", visible: true }
    // Breakouts open with Show(), usually from a click.
    case "breakout": return { width: 320, height: 200, visible: false }
    case "unit": return { x: 0, y: 0, size: 1, unit: "unknown", visible: true }
    case "icon": return { x: 0, y: 0, size: 1, asset: "unset", visible: true }
    case "map-text": return { x: 0, y: 0, text: " ", fontSize: 14, color: "#ffffffff", visible: true }
    case "line": return { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#ffffffff", width: 1, visible: true }
    case "arrow": return { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#ffffffff", width: 1, headSize: 1, visible: true }
    case "circle": return { x: 0, y: 0, radius: 0.1, color: "#ffffffff", width: 1, visible: true }
    case "cone": return { x: 0, y: 0, radius: 0.1, facing: 0, angle: 1, color: "#ffffffff", width: 1, visible: true }
    case "polygon": return { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], color: "#ffffffff", width: 1, visible: true }
    default: {
      const spec = widgetSpec(kind)
      if (!spec) throw new GuideLuaError(`no default props for ${kind}`)
      return widgetDefaultProps(spec)
    }
  }
}

export function createGuideRuntime(options: GuideRuntimeOptions) {
  const limits = { ...DEFAULT_LIMITS, ...options.limits }
  const capabilities = new Set<GuideCapability>(options.capabilities ?? ["ui", "map", "input", "timers"])
  const L = lauxlib.luaL_newstate()
  const operations: SceneOperation[] = []
  const objects = new Map<string, ObjectState>([[UI_ROOT_ID, { kind: "root", shown: true, parentId: null }]])
  let canvas: { width: number | null; height: number | null } = { width: null, height: null }
  const callbacks = new Map<string, number>()
  const timers = new Map<number, number>()
  const modules = new Map<string, number>()
  const panelCallbacks = new Map<PanelStream, number>()
  let anyEventCallback: number | undefined // Panel:OnEvent(fn), called for every declared stream.
  let completeCallback: number | undefined // Panel:OnComplete, called once after the host's last event.
  let eventsStopped = false // Panel:StopEvents: the host delivers no more events and runs OnComplete.
  // Weak keys preserve replay order for retained messages without retaining Lua tables.
  const eventIndices = new WeakMap<object, number>()
  const allowedPanelStreams = new Set(options.panelStreams ?? [])
  if ([...allowedPanelStreams].some((stream) => !PANEL_STREAMS.includes(stream))) throw new GuideLuaError("unsupported panel stream")
  if (Object.keys(options.sources).some((path) => isReservedLuaPath(path.toLowerCase()))) throw new GuideLuaError("reserved Chronicle module path")
  let nextObjectId = 1
  // The page's time range filter, in ms from encounter start; null bounds are open.
  let timeRange: PanelTimeRange | null = null
  let timeRangeRequest: { range: PanelTimeRange | null } | undefined
  let handlingClick = false
  let timeRangeCallback: number | undefined // Chronicle.OnTimeRangeChanged
  // The Replay playhead in ms from encounter start; null when Replay is off.
  let replayTime: number | null = null
  let replayTimeRequest: { ms: number } | undefined
  let replayTimeCallback: number | undefined // Chronicle.OnReplayTime
  // Chronicle.GetSpell: answers the host sent (null when unknown), callbacks waiting per spell, and IDs to request.
  const spells = new Map<number, PanelSpellInfo | null>()
  const spellWaiters = new Map<number, number[]>()
  let spellWaiterCount = 0
  const spellRequests = new Set<number>()
  let nextTimerId = 1
  let stopped = false

  const fail = (message: string): never => { throw new GuideLuaError(message) }
  const ensureActive = () => { if (stopped) fail("guide runtime is stopped") }
  const luaError = (state: LuaState, message: string): never => {
    lauxlib.luaL_error(state, to_luastring(message))
    throw new GuideLuaError(message)
  }
  const stringAt = (state: LuaState, index: number, label = "string") => {
    const bytes = lauxlib.luaL_checkstring(state, index) as Uint8Array
    if (bytes.byteLength > limits.maxStringBytes) luaError(state, `${label} exceeds string limit`)
    return lua.lua_tojsstring(state, index) as string
  }
  const optionalString = (state: LuaState, index: number, fallback: string) => lua.lua_isnoneornil(state, index) ? fallback : stringAt(state, index)
  const numberAt = (state: LuaState, index: number) => lauxlib.luaL_checknumber(state, index) as number
  const optionalBoolean = (state: LuaState, index: number, fallback = false, label = "value") => {
    if (lua.lua_isnoneornil(state, index)) return fallback
    if (!lua.lua_isboolean(state, index)) luaError(state, `${label} must be a boolean`)
    return lua.lua_toboolean(state, index) !== 0
  }
  const positiveIdAt = (state: LuaState, index: number, label: string) => {
    const value = numberAt(state, index)
    if (!Number.isInteger(value) || value < 1 || value > 0x7fffffff) luaError(state, `${label} must be a positive 32-bit integer`)
    return value
  }
  const assetPathAt = (state: LuaState, index: number) => {
    const value = stringAt(state, index, "asset path")
    const segments = value.split("/")
    if (value.length > 255 || value.startsWith("/") || value.includes("\\") || value.includes(":")
      || [...value].some((character) => { const code = character.charCodeAt(0); return code < 32 || code > 126 })
      || segments.some((segment) => !segment || segment === "." || segment === "..")) {
      luaError(state, "asset path must be a normalized package-local path")
    }
    return value
  }
  const iconNameAt = (state: LuaState, index: number) => {
    const value = stringAt(state, index, "icon name").toLowerCase()
    if (!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(value)) luaError(state, "icon name must contain only letters, numbers, underscores, or hyphens")
    return value
  }
  const pushString = (state: LuaState, value: string) => lua.lua_pushstring(state, to_luastring(value))
  const setField = (state: LuaState, index: number, name: string) => lua.lua_setfield(state, index, to_luastring(name))
  const pushBoolean = (state: LuaState, value: boolean) => lua.lua_pushboolean(state, value ? 1 : 0)
  // Whole numbers arrive as Lua integers so tostring/concatenation print "42", not "42.0". Fengari's
  // integers are 32-bit, so larger whole numbers stay floats.
  const pushNumber = (state: LuaState, value: number) => { if ((value | 0) === value) lua.lua_pushinteger(state, value); else lua.lua_pushnumber(state, value) }
  const addOperation = (operation: SceneOperation) => {
    if (operations.length >= limits.maxOperations) fail("operation limit exceeded")
    operations.push(operation)
  }
  const objectIdAt = (state: LuaState, index = 1) => {
    lauxlib.luaL_checktype(state, index, lua.LUA_TTABLE)
    lua.lua_getfield(state, index, to_luastring("__guide_id"))
    if (!lua.lua_isstring(state, -1)) luaError(state, "invalid guide object")
    const id = lua.lua_tojsstring(state, -1) as string
    lua.lua_pop(state, 1)
    if (!objects.has(id)) luaError(state, `unknown object '${id}'`)
    return id
  }
  const setProps = (id: string, props: Record<string, unknown>) => addOperation({ op: "set", id, props })
  const propertyMethod = (read: (state: LuaState) => Record<string, unknown>): LuaFunction => (state) => {
    const id = objectIdAt(state)
    const props = read(state)
    const kind = objects.get(id)!.kind
    if (kind === "root") {
      // UIParent's size is the panel's content size: bigger than the panel scrolls.
      if (Object.keys(props).some(property => property !== "width" && property !== "height")) luaError(state, "UIParent only supports SetSize, SetWidth, SetHeight and SetScript")
      canvas = { ...canvas, ...props as { width?: number; height?: number } }
      for (const value of [canvas.width, canvas.height]) if (value !== null && !(value >= 1 && value <= MAX_CANVAS_SIZE)) luaError(state, `UIParent size must be between 1 and ${MAX_CANVAS_SIZE}`)
      addOperation({ op: "canvas", width: canvas.width, height: canvas.height })
      return 0
    }
    const supported = SUPPORTED_PROPS[kind as NodeKind]
    for (const property of Object.keys(props)) if (!supported.has(property)) luaError(state, `${property} is not supported for ${kind}`)
    setProps(id, props)
    return 0
  }
  const pushFunction = (state: LuaState, fn: LuaFunction) => lua.lua_pushcfunction(state, (inner: LuaState) => {
    try { return fn(inner) } catch (error) { if (error instanceof GuideLuaError) luaError(inner, error.message); throw error }
  })
  const registerFunction = (state: LuaState, name: string, fn: LuaFunction) => { pushFunction(state, fn); setField(state, -2, name) }
  const normalizeColor = (state: LuaState, offset = 2) => {
    const values = [numberAt(state, offset), numberAt(state, offset + 1), numberAt(state, offset + 2), lua.lua_isnoneornil(state, offset + 3) ? 1 : numberAt(state, offset + 3)]
    if (values.some((value) => value < 0 || value > 1)) luaError(state, "color components must be between 0 and 1")
    return `#${values.map((value) => Math.round(value * 255).toString(16).padStart(2, "0")).join("")}`
  }
  const readPoints = (state: LuaState, index: number) => {
    lauxlib.luaL_checktype(state, index, lua.LUA_TTABLE)
    const length = lua.lua_rawlen(state, index) as number
    const values: number[] = []
    for (let i = 1; i <= length; i++) {
      lua.lua_rawgeti(state, index, i)
      if (!lua.lua_isnumber(state, -1)) luaError(state, "points must contain numbers")
      values.push(lua.lua_tonumber(state, -1)); lua.lua_pop(state, 1)
    }
    if (values.length < 4 || values.length % 2 !== 0) luaError(state, "points must contain coordinate pairs")
    return Array.from({ length: values.length / 2 }, (_, index) => ({ x: values[index * 2], y: values[index * 2 + 1] }))
  }
  const kindAt = (id: string) => objects.get(id)!.kind
  const readContext: LuaReadContext = { lua, toLuaString: to_luastring, fail: luaError, string: stringAt, number: numberAt }
  /** A widget setter from ../widgets, dispatched on the object's kind so widgets can share method names. */
  const widgetMethod = (method: string, setters: ReadonlyMap<NodeKind, WidgetSetter>): LuaFunction => (state) => {
    const id = objectIdAt(state)
    const kind = kindAt(id)
    const setter = kind === "root" ? undefined : setters.get(kind)
    if (!setter) return luaError(state, `${method} is not supported for ${kind === "root" ? "UIParent" : kind}`)
    setProps(id, Object.fromEntries(setter.args.map((arg, index) => [arg.prop, arg.type.read(readContext, state, index + 2, `${method} ${arg.prop}`)])))
    return 0
  }

  function releaseCallback(key: string) {
    const ref = callbacks.get(key)
    if (ref !== undefined) { lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, ref); callbacks.delete(key) }
  }
  function setScript(state: LuaState) {
    if (!capabilities.has("input")) luaError(state, "guide did not declare the input capability")
    const id = objectIdAt(state)
    const script = stringAt(state, 2, "script")
    const event = script === "OnClick" ? "click" : script === "OnSizeChanged" ? "resize" : script === "OnClose" ? "close" : null
    if (!event) luaError(state, `unsupported script '${script}'`)
    const breakout = kindAt(id) === "breakout"
    if (event === "close" && !breakout) luaError(state, "OnClose is only supported for Breakout frames")
    if (event === "click" && breakout) luaError(state, "OnClick is not supported for Breakout frames; put a Button inside it")
    lauxlib.luaL_checktype(state, 3, lua.LUA_TFUNCTION)
    const key = `${id}:${event}`
    if (!callbacks.has(key) && callbacks.size >= limits.maxCallbacks) luaError(state, "callback limit exceeded")
    releaseCallback(key); lua.lua_pushvalue(state, 3)
    callbacks.set(key, lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX))
    if (event === "click") addOperation({ op: "listen", id, event: "click", enabled: true })
    return 0
  }
  function childCreator(kind: NodeKind): LuaFunction {
    return (state) => createObject(state, kind, optionalString(state, 2, `${kind}-${nextObjectId++}`), objectIdAt(state))
  }
  const makeObject = (state: LuaState, id: string) => {
    lua.lua_createtable(state, 0, 30); pushString(state, id); setField(state, -2, "__guide_id")
    registerFunction(state, "SetParent", (inner) => { const objectId = objectIdAt(inner); const parentId = objectIdAt(inner, 2); if (kindAt(objectId) === "breakout") luaError(inner, "Breakout frames cannot be reparented"); objects.get(objectId)!.parentId = parentId; addOperation({ op: "set", id: objectId, parentId, props: {} }); return 0 })
    registerFunction(state, "SetPoint", propertyMethod((inner) => {
      const rawAnchor = stringAt(inner, 2, "anchor").toUpperCase(); const anchor = ANCHORS[rawAnchor]
      if (!anchor) luaError(inner, `unsupported anchor '${rawAnchor}'`)
      return { anchor, x: lua.lua_isnoneornil(inner, 5) ? 0 : numberAt(inner, 5), y: lua.lua_isnoneornil(inner, 6) ? 0 : numberAt(inner, 6) }
    }))
    registerFunction(state, "SetSize", propertyMethod((inner) => {
      const kind = kindAt(objectIdAt(inner))
      const width = numberAt(inner, 2); const height = numberAt(inner, 3)
      if (kind === "unit" || kind === "icon") return { size: Math.max(width, height) }
      if (kind === "frame" || kind === "text" || kind === "texture" || kind === "button" || kind === "breakout" || kind === "root" || isWidgetKind(kind)) return { width, height }
      return luaError(inner, `SetSize is not supported for ${kind}`)
    }))
    registerFunction(state, "SetWidth", propertyMethod((inner) => ({ width: numberAt(inner, 2) })))
    registerFunction(state, "SetHeight", propertyMethod((inner) => ({ height: numberAt(inner, 2) })))
    registerFunction(state, "SetText", propertyMethod((inner) => ({ text: stringAt(inner, 2, "text") })))
    registerFunction(state, "SetTexture", propertyMethod((inner) => kindAt(objectIdAt(inner)) === "texture"
      ? { asset: assetPathAt(inner, 2), textureType: "asset", tooltip: false }
      : { asset: assetPathAt(inner, 2) }))
    registerFunction(state, "SetSpell", propertyMethod((inner) => ({
      textureType: "spell",
      textureId: positiveIdAt(inner, 2, "spell ID"),
      tooltip: optionalBoolean(inner, 3, false, "tooltip"),
    })))
    registerFunction(state, "SetItem", propertyMethod((inner) => ({
      textureType: "item",
      textureId: positiveIdAt(inner, 2, "item ID"),
      tooltip: optionalBoolean(inner, 3, false, "tooltip"),
    })))
    registerFunction(state, "SetIcon", propertyMethod((inner) => ({
      textureType: "icon",
      iconName: iconNameAt(inner, 2),
      tooltip: false,
    })))
    registerFunction(state, "SetColor", propertyMethod((inner) => ({ color: normalizeColor(inner) })))
    registerFunction(state, "SetBackgroundColor", propertyMethod((inner) => ({ backgroundColor: normalizeColor(inner) })))
    registerFunction(state, "SetBorderColor", propertyMethod((inner) => ({ borderColor: normalizeColor(inner) })))
    registerFunction(state, "SetAlpha", propertyMethod((inner) => ({ alpha: numberAt(inner, 2) })))
    registerFunction(state, "SetLayer", propertyMethod((inner) => ({ zIndex: lua.lua_isnumber(inner, 2) ? numberAt(inner, 2) : ({ BACKGROUND: 0, ARTWORK: 10, OVERLAY: 20 }[stringAt(inner, 2).toUpperCase()] ?? 0) })))
    registerFunction(state, "SetPosition", propertyMethod((inner) => ({ x: numberAt(inner, 2), y: numberAt(inner, 3) })))
    registerFunction(state, "SetMapPosition", propertyMethod((inner) => ({ x: numberAt(inner, 2), y: numberAt(inner, 3) })))
    registerFunction(state, "SetFacing", propertyMethod((inner) => ({ facing: numberAt(inner, 2) })))
    registerFunction(state, "SetLabel", propertyMethod((inner) => ({ label: stringAt(inner, 2, "label") })))
    registerFunction(state, "SetCreatureID", propertyMethod((inner) => {
      const entry = numberAt(inner, 2)
      if (!Number.isInteger(entry) || entry < 1) luaError(inner, "creature ID must be a positive integer")
      return { entry, unit: String(entry) }
    }))
    registerFunction(state, "SetRole", propertyMethod((inner) => ({ role: stringAt(inner, 2, "role") })))
    registerFunction(state, "SetFontSize", propertyMethod((inner) => ({ fontSize: numberAt(inner, 2) })))
    registerFunction(state, "SetRadius", propertyMethod((inner) => ({ radius: numberAt(inner, 2) })))
    registerFunction(state, "SetAngle", propertyMethod((inner) => ({ angle: numberAt(inner, 2) })))
    registerFunction(state, "SetLineWidth", propertyMethod((inner) => ({ width: numberAt(inner, 2) })))
    registerFunction(state, "SetHeadSize", propertyMethod((inner) => ({ headSize: numberAt(inner, 2) })))
    registerFunction(state, "SetFillColor", propertyMethod((inner) => ({ fillColor: normalizeColor(inner) })))
    registerFunction(state, "SetPoints", propertyMethod((inner) => ({ points: readPoints(inner, 2) })))
    // Hover text drawn by the host: hovering never runs Lua. nil or "" removes it.
    registerFunction(state, "SetTooltip", propertyMethod((inner) => ({ tooltipText: optionalString(inner, 2, "") })))
    registerFunction(state, "SetLink", propertyMethod((inner) => {
      const href = optionalString(inner, 2, "")
      try { sitePath(href, "SetLink") } catch { luaError(inner, "SetLink expects a path on this site starting with /, such as \"/modules/author/slug\"") }
      return { href }
    }))
    registerFunction(state, "SetTitle", propertyMethod((inner) => ({ title: optionalString(inner, 2, "") })))
    // Breakouts open beside this frame; nil opens them beside the panel.
    registerFunction(state, "SetAnchor", propertyMethod((inner) => {
      if (lua.lua_isnoneornil(inner, 2)) return { anchorTo: null }
      const anchorId = objectIdAt(inner, 2)
      if (anchorId === UI_ROOT_ID || kindAt(anchorId) === "breakout") luaError(inner, "SetAnchor expects a frame inside the panel")
      return { anchorTo: anchorId }
    }))
    registerFunction(state, "Show", (inner) => { const objectId = objectIdAt(inner); objects.get(objectId)!.shown = true; setProps(objectId, { visible: true }); return 0 })
    registerFunction(state, "Hide", (inner) => { const objectId = objectIdAt(inner); objects.get(objectId)!.shown = false; setProps(objectId, { visible: false }); return 0 })
    registerFunction(state, "IsShown", (inner) => { pushBoolean(inner, objects.get(objectIdAt(inner))!.shown); return 1 })
    registerFunction(state, "Destroy", (inner) => {
      const objectId = objectIdAt(inner); if (objectId === UI_ROOT_ID) luaError(inner, "UIParent cannot be destroyed")
      // The scene removes descendants too, so free them here: they no longer count toward the
      // object limit, their IDs can be reused, and their callbacks are released.
      const children = new Map<string, string[]>()
      for (const [id, object] of objects) if (object.parentId !== null) children.set(object.parentId, [...children.get(object.parentId) ?? [], id])
      const doomed = new Set([objectId])
      for (const id of doomed) for (const child of children.get(id) ?? []) doomed.add(child)
      for (const id of doomed) objects.delete(id)
      for (const key of [...callbacks.keys()]) if (doomed.has(key.slice(0, key.lastIndexOf(":")))) releaseCallback(key)
      addOperation({ op: "destroy", id: objectId }); return 0
    })
    registerFunction(state, "SetScript", setScript)
    for (const [method, setters] of WIDGET_SETTERS) {
      lua.lua_getfield(state, -1, to_luastring(method))
      const taken = !lua.lua_isnil(state, -1); lua.lua_pop(state, 1)
      if (taken) fail(`widget method ${method} collides with a built-in method`)
      registerFunction(state, method, widgetMethod(method, setters))
    }
    registerFunction(state, "CreateFontString", childCreator("text")); registerFunction(state, "CreateTexture", childCreator("texture"))
    return 1
  }
  const createObject = (state: LuaState, kind: NodeKind, id: string, parentId: string | null = null) => {
    if (objects.size - 1 >= limits.maxObjects) luaError(state, "object limit exceeded")
    if (objects.has(id)) luaError(state, `duplicate object '${id}'`)
    objects.set(id, { kind, shown: kind !== "breakout", parentId }); addOperation({ op: "create", id, kind, parentId, props: defaultProps(kind) })
    return makeObject(state, id)
  }

  const normalizeModule = (requested: string) => {
    if (!requested || requested.includes("\\") || requested.includes("\0") || requested.startsWith("/") || requested.split("/").includes("..")) fail("require expects a normalized package-local module name")
    let path = requested.replace(/^\.\//, ""); if (!path.includes("/")) path = path.replace(/\./g, "/"); if (!path.endsWith(".lua")) path += ".lua"
    if (path.split("/").some((segment) => !segment || segment === "." || segment === "..")) fail("require expects a normalized package-local module name")
    return path
  }
  const throwLuaError = (state: LuaState): never => {
    const message = lua.lua_tojsstring(state, -1) || "unknown Lua error"
    lua.lua_pop(state, 1)
    throw new GuideLuaError(message)
  }
  let activeBudget: { remaining: number } | null = null
  const protectedCall = (state: LuaState, args: number, results: number, instructionBudget: number) => {
    // require() re-enters protectedCall on the same Lua state. Nested calls must
    // share the outer quota and must not clear its hook when they return.
    const outerBudget = activeBudget
    if (!outerBudget) {
      const budget = { remaining: instructionBudget }
      activeBudget = budget
      lua.lua_sethook(state, (hookState: LuaState) => {
        budget.remaining -= limits.instructionHookCount
        if (budget.remaining <= 0) lauxlib.luaL_error(hookState, to_luastring("instruction budget exceeded"))
      }, lua.LUA_MASKCOUNT, limits.instructionHookCount)
    }
    try {
      const status = lua.lua_pcall(state, args, results, 0)
      if (status !== lua.LUA_OK) throwLuaError(state)
    } finally {
      if (!outerBudget) {
        lua.lua_sethook(state, null, 0, 0)
        activeBudget = null
      }
    }
  }
  const loadChunk = (state: LuaState, source: string, filename: string) => {
    const bytes = to_luastring(source); const status = lauxlib.luaL_loadbuffer(state, bytes, bytes.length, to_luastring(`@${filename}`)); if (status !== lua.LUA_OK) throwLuaError(state)
  }
  function requireModule(state: LuaState) {
    const requested = stringAt(state, 1, "module name")
    let path: string
    try { path = normalizeModule(requested) } catch (error) { return luaError(state, error instanceof Error ? error.message : String(error)) }
    const cached = modules.get(path); if (cached !== undefined) { lua.lua_rawgeti(state, lua.LUA_REGISTRYINDEX, cached); return 1 }
    const source = isReservedLuaPath(path) ? trustedLuaModule(path) : options.sources[path]
    if (source === undefined) return luaError(state, `module '${requested}' not found`)
    loadChunk(state, source, path)
    try {
      protectedCall(state, 0, 1, limits.callbackInstructions)
    } catch (error) {
      return luaError(state, error instanceof Error ? error.message : `error loading ${path}`)
    }
    if (lua.lua_isnil(state, -1)) { lua.lua_pop(state, 1); pushBoolean(state, true) }
    lua.lua_pushvalue(state, -1); modules.set(path, lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX)); return 1
  }
  const installGlobals = () => {
    for (const [name, open] of [
      ["_G", lualib.luaopen_base],
      ["table", lualib.luaopen_table],
      ["string", lualib.luaopen_string],
      ["math", lualib.luaopen_math],
      ["utf8", lualib.luaopen_utf8],
    ] as const) {
      lauxlib.luaL_requiref(L, to_luastring(name), open, 1)
      lua.lua_pop(L, 1)
    }
    for (const name of ["dofile", "loadfile", "load", "collectgarbage", "fengari", "js", "window", "document", "fetch", "XMLHttpRequest", "WebSocket"]) { lua.lua_pushnil(L); lua.lua_setglobal(L, to_luastring(name)) }
    if (capabilities.has("ui")) {
      makeObject(L, UI_ROOT_ID); lua.lua_setglobal(L, to_luastring("UIParent"))
      pushFunction(L, (state) => {
        const frameType = stringAt(state, 1, "frame type"); const kind = UI_KINDS.get(frameType); if (!kind) return luaError(state, `unsupported frame type '${frameType}'`)
        const id = optionalString(state, 2, `${kind}-${nextObjectId++}`); const parentId = lua.lua_isnoneornil(state, 3) ? UI_ROOT_ID : objectIdAt(state, 3)
        if (kind === "breakout" && parentId !== UI_ROOT_ID) return luaError(state, "Breakout frames are top-level; omit the parent")
        return createObject(state, kind, id, parentId)
      }); lua.lua_setglobal(L, to_luastring("CreateFrame"))
    }
    if (capabilities.has("map")) {
      lua.lua_createtable(L, 0, MAP_KINDS.size + 1)
      for (const [name, kind] of MAP_KINDS) registerFunction(L, name, (state) => { const index = lua.lua_istable(state, 1) ? 2 : 1; return createObject(state, kind, optionalString(state, index, `${kind}-${nextObjectId++}`)) })
      registerFunction(L, "SetCamera", (state) => { const offset = lua.lua_istable(state, 1) ? 1 : 0; addOperation({ op: "camera", x: numberAt(state, 1 + offset), y: numberAt(state, 2 + offset), zoom: numberAt(state, 3 + offset) }); return 0 })
      lua.lua_setglobal(L, to_luastring("Map"))
    }
    if (capabilities.has("timers")) {
      lua.lua_createtable(L, 0, 1); registerFunction(L, "After", (state) => {
        if (timers.size >= limits.maxTimers) return luaError(state, "timer limit exceeded")
        const delayMs = numberAt(state, 1) * 1_000; if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > limits.maxTimerDelayMs) return luaError(state, "timer delay exceeds limit")
        lauxlib.luaL_checktype(state, 2, lua.LUA_TFUNCTION); lua.lua_pushvalue(state, 2); const ref = lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX); const id = nextTimerId++
        timers.set(id, ref); options.scheduleTimer?.(id, delayMs); pushString(state, String(id)); return 1
      }); lua.lua_setglobal(L, to_luastring("C_Timer"))
    }
    if (options.panelStreams) {
      lua.lua_createtable(L, 0, 1)
      registerFunction(L, "OnEvent", (state) => {
        const first = lua.lua_istable(state, 1) ? 2 : 1
        // Panel:OnEvent(fn) receives every declared stream; event.stream says which.
        if (lua.lua_isfunction(state, first)) {
          if (anyEventCallback !== undefined) lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, anyEventCallback)
          lua.lua_pushvalue(state, first)
          anyEventCallback = lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX)
          return 0
        }
        const stream = stringAt(state, first) as PanelStream
        const index = first + 1
        if (!allowedPanelStreams.has(stream)) return luaError(state, `panel stream '${stream}' is not allowed`)
        lauxlib.luaL_checktype(state, index, lua.LUA_TFUNCTION)
        const old = panelCallbacks.get(stream)
        if (old !== undefined) lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, old)
        lua.lua_pushvalue(state, index)
        panelCallbacks.set(stream, lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX))
        return 0
      })
      registerFunction(L, "OnComplete", (state) => {
        const index = lua.lua_istable(state, 1) ? 2 : 1
        lauxlib.luaL_checktype(state, index, lua.LUA_TFUNCTION)
        if (completeCallback !== undefined) lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, completeCallback)
        lua.lua_pushvalue(state, index)
        completeCallback = lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX)
        return 0
      })
      // Ends the replay early: the host stops after the current callback returns, then runs OnComplete.
      registerFunction(L, "StopEvents", () => { eventsStopped = true; return 0 })
      lua.lua_setglobal(L, to_luastring("Panel"))
      const units = options.units ?? {}
      const playerGuids = Object.values(units).filter(unit => unit.player)
        .sort((a, b) => a.name.localeCompare(b.name)).map(unit => unit.guid)
      const pushUnit = (state: LuaState, unit: PanelUnit) => {
        lua.lua_createtable(state, 0, 8)
        for (const [key, value] of Object.entries(unit)) { pushArgument(state, value); setField(state, -2, key) }
      }
      lua.lua_createtable(L, 0, 2)
      registerFunction(L, "GetUnit", (state) => {
        const guid = stringAt(state, lua.lua_istable(state, 1) ? 2 : 1, "guid")
        const unit = Object.hasOwn(units, guid) ? units[guid] : undefined
        if (unit) pushUnit(state, unit); else lua.lua_pushnil(state)
        return 1
      })
      registerFunction(L, "Filter", (state) => {
        // Read bounded plain data, never invoke Lua metamethods or retain a decoder object.
        let entries = 0
        const read = (index: number, depth: number): unknown => {
          const type = lua.lua_type(state, index)
          if (type === lua.LUA_TSTRING) return stringAt(state, index)
          if (type === lua.LUA_TNUMBER) {
            const value = lua.lua_tonumber(state, index) as number
            if (!Number.isFinite(value)) return luaError(state, "invalid filter message number")
            return value
          }
          if (type === lua.LUA_TBOOLEAN) return Boolean(lua.lua_toboolean(state, index))
          if (type !== lua.LUA_TTABLE || depth > 4) return luaError(state, "invalid filter message")
          const absolute = lua.lua_absindex(state, index)
          const length = lua.lua_rawlen(state, absolute) as number
          const result: Record<string, unknown> | unknown[] = length > 0 ? [] : Object.create(null)
          lua.lua_pushnil(state)
          while (lua.lua_next(state, absolute)) {
            if (++entries > 4096) return luaError(state, "filter message is too large")
            const keyType = lua.lua_type(state, -2)
            const key = keyType === lua.LUA_TSTRING ? stringAt(state, -2) : keyType === lua.LUA_TNUMBER ? lua.lua_tonumber(state, -2) as number : null
            if (Array.isArray(result)) {
              if (typeof key !== "number" || !Number.isInteger(key) || key < 1 || key > length) return luaError(state, "invalid filter message array")
              result[key - 1] = read(-1, depth + 1)
            } else {
              if (typeof key !== "string") return luaError(state, "invalid filter message field")
              result[key] = read(-1, depth + 1)
            }
            lua.lua_pop(state, 1)
          }
          return result
        }
        const message = read(1, 0) as Record<string, unknown>
        if (!message || Array.isArray(message) || typeof message.stream !== "string" || !allowedPanelStreams.has(message.stream as PanelStream) ||
            typeof message.offsetMs !== "number" || message.offsetMs < 0 || typeof message.encounterId !== "string" || typeof message.selected !== "boolean") {
          return luaError(state, "Chronicle.Filter expects a combat-event message")
        }
        try { pushBoolean(state, options.filter?.(message, eventIndices.get(lua.lua_topointer(state, 1) as object)) ?? true) }
        catch (error) { return luaError(state, `invalid filter message: ${error instanceof Error ? error.message : String(error)}`) }
        return 1
      })
      // The page-wide time range. Changing it filters every panel, so only a viewer's click may do it.
      const requestTimeRange = (state: LuaState, range: PanelTimeRange | null) => {
        if (!capabilities.has("input")) luaError(state, "Chronicle.SetTimeRange needs the input capability")
        if (!handlingClick) luaError(state, "Chronicle.SetTimeRange and ClearTimeRange can only be called from an OnClick handler")
        timeRange = range
        timeRangeRequest = { range }
      }
      const boundAt = (state: LuaState, index: number, label: string): number | null => {
        if (lua.lua_isnoneornil(state, index)) return null
        const value = numberAt(state, index)
        if (!Number.isFinite(value) || value < 0) luaError(state, `${label} must be a non-negative number of milliseconds`)
        return Math.round(value)
      }
      registerFunction(L, "SetTimeRange", (state) => {
        const offset = lua.lua_istable(state, 1) ? 1 : 0
        const startMs = boundAt(state, 1 + offset, "startMs")
        const endMs = boundAt(state, 2 + offset, "endMs")
        if (startMs !== null && endMs !== null && endMs < startMs) luaError(state, "endMs must be at least startMs")
        requestTimeRange(state, startMs === null && endMs === null ? null : { startMs, endMs })
        return 0
      })
      registerFunction(L, "ClearTimeRange", (state) => { requestTimeRange(state, null); return 0 })
      registerFunction(L, "OnTimeRangeChanged", (state) => {
        const index = lua.lua_istable(state, 1) ? 2 : 1
        lauxlib.luaL_checktype(state, index, lua.LUA_TFUNCTION)
        if (timeRangeCallback !== undefined) lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, timeRangeCallback)
        lua.lua_pushvalue(state, index)
        timeRangeCallback = lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX)
        return 0
      })
      registerFunction(L, "GetTimeRange", (state) => {
        if (!timeRange) { lua.lua_pushnil(state); lua.lua_pushnil(state); return 2 }
        for (const bound of [timeRange.startMs, timeRange.endMs]) if (bound === null) lua.lua_pushnil(state); else pushNumber(state, bound)
        return 2
      })
      // The Replay playhead. Moving it moves every panel, so only a viewer's click may do it.
      registerFunction(L, "SetReplayTime", (state) => {
        const offset = lua.lua_istable(state, 1) ? 1 : 0
        if (!capabilities.has("input")) luaError(state, "Chronicle.SetReplayTime needs the input capability")
        if (!handlingClick) luaError(state, "Chronicle.SetReplayTime can only be called from an OnClick handler")
        const ms = boundAt(state, 1 + offset, "ms")
        if (ms === null) luaError(state, "Chronicle.SetReplayTime expects a number of milliseconds")
        replayTimeRequest = { ms: ms! }
        return 0
      })
      registerFunction(L, "OnReplayTime", (state) => {
        const index = lua.lua_istable(state, 1) ? 2 : 1
        lauxlib.luaL_checktype(state, index, lua.LUA_TFUNCTION)
        if (replayTimeCallback !== undefined) lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, replayTimeCallback)
        lua.lua_pushvalue(state, index)
        replayTimeCallback = lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX)
        return 0
      })
      registerFunction(L, "GetReplayTime", (state) => {
        if (replayTime === null) lua.lua_pushnil(state); else pushNumber(state, replayTime)
        return 1
      })
      // Spell data is fetched by the host, so answers arrive later as callbacks. A spell this
      // module already looked up calls back immediately, like WoW's ContinueOnSpellLoad.
      registerFunction(L, "GetSpell", (state) => {
        const offset = lua.lua_istable(state, 1) ? 1 : 0
        const spellId = positiveIdAt(state, 1 + offset, "spell ID")
        lauxlib.luaL_checktype(state, 2 + offset, lua.LUA_TFUNCTION)
        if (spells.has(spellId)) {
          lua.lua_pushvalue(state, 2 + offset); pushSpell(state, spells.get(spellId)!)
          lua.lua_call(state, 1, 0)
          return 0
        }
        if (!spellWaiters.has(spellId) && spells.size + spellWaiters.size >= MAX_SPELL_LOOKUPS) return luaError(state, `spell lookup limit exceeded (${MAX_SPELL_LOOKUPS} spells)`)
        if (spellWaiterCount >= MAX_SPELL_WAITERS) return luaError(state, "too many pending GetSpell callbacks")
        lua.lua_pushvalue(state, 2 + offset)
        const ref = lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX)
        const waiting = spellWaiters.get(spellId)
        if (waiting) waiting.push(ref)
        else { spellWaiters.set(spellId, [ref]); spellRequests.add(spellId) }
        spellWaiterCount++
        return 0
      })
      registerFunction(L, "GetPlayers", (state) => {
        lua.lua_createtable(state, playerGuids.length, 0)
        playerGuids.forEach((guid, index) => { pushString(state, guid); lua.lua_rawseti(state, -2, index + 1) })
        return 1
      })
      lua.lua_setglobal(L, to_luastring("Chronicle"))
    }
    let chapter = ""
    lua.lua_createtable(L, 0, 2); registerFunction(L, "SetChapter", (state) => { chapter = stringAt(state, lua.lua_istable(state, 1) ? 2 : 1, "chapter"); addOperation({ op: "chapter", chapter }); return 0 }); registerFunction(L, "GetChapter", (state) => { pushString(state, chapter || " "); return 1 }); lua.lua_setglobal(L, to_luastring("Guide"))
    pushFunction(L, requireModule); lua.lua_setglobal(L, to_luastring("require"))
  }
  const pushArgument = (state: LuaState, value: unknown) => {
    if (value === null || value === undefined) lua.lua_pushnil(state)
    else if (typeof value === "string") { if (encoder.encode(value).byteLength > limits.maxStringBytes) fail("event string exceeds string limit"); pushString(state, value) }
    // Whole numbers arrive as Lua integers so tostring/concatenation print "42", not "42.0".
    else if (typeof value === "number" && Number.isFinite(value)) pushNumber(state, value)
    else if (typeof value === "boolean") pushBoolean(state, value)
    else fail("unsupported callback argument")
  }
  const pushSpell = (state: LuaState, spell: PanelSpellInfo | null) => {
    if (!spell) { lua.lua_pushnil(state); return }
    lua.lua_createtable(state, 0, 4)
    pushNumber(state, spell.id); setField(state, -2, "id")
    pushString(state, spell.name); setField(state, -2, "name")
    if (spell.rank) { pushString(state, spell.rank); setField(state, -2, "rank") }
    if (spell.icon) { pushString(state, spell.icon); setField(state, -2, "icon") }
  }
  const keys = new Map<string, Uint8Array>()
  const key = (name: string) => { let bytes = keys.get(name); if (!bytes) { bytes = to_luastring(name); keys.set(name, bytes) } return bytes }
  const pushEventValue = (state: LuaState, value: unknown, depth: number) => {
    if (typeof value === "string") {
      // UTF-16 length * 3 bounds the UTF-8 size, so only long strings pay for an encode.
      if (value.length * 3 > limits.maxStringBytes && encoder.encode(value).byteLength > limits.maxStringBytes) fail("event string exceeds string limit")
      pushString(state, value)
    }
    else if (typeof value === "number") { if (Number.isFinite(value)) pushNumber(state, value); else lua.lua_pushnil(state) }
    else if (typeof value === "boolean") pushBoolean(state, value)
    else if (value && typeof value === "object" && depth < 4) pushEventTable(state, value, depth + 1)
    else lua.lua_pushnil(state)
  }
  // Decoder bookkeeping, not event data. Arrays with a matching "...Count" field are reused buffers.
  const internalFields = new Set(["type", "index", "offsetMilli", "globalOffsetMilli", "activity", "isSynthetic"])
  const pushEventTable = (state: LuaState, value: object, depth: number) => {
    if (Array.isArray(value)) {
      lua.lua_createtable(state, value.length, 0)
      value.forEach((item, i) => { pushEventValue(state, item, depth); lua.lua_rawseti(state, -2, i + 1) })
      return
    }
    const record = value as Record<string, unknown>
    lua.lua_createtable(state, 0, 8)
    for (const name in record) {
      const field = record[name]
      if (field === null || field === undefined || internalFields.has(name) || name.endsWith("Count")) continue
      const count = Array.isArray(field) ? record[`${name}Count`] ?? record[`${name.replace(/s$/, "")}Count`] : undefined
      if (typeof count === "number") {
        lua.lua_createtable(state, count, 0)
        for (let i = 0; i < count; i++) { pushEventValue(state, (field as unknown[])[i], depth + 1); lua.lua_rawseti(state, -2, i + 1) }
      } else pushEventValue(state, field, depth)
      // The decoders call the acting unit "caster"; addons see "source" on every stream.
      lua.lua_setfield(state, -2, key(name === "caster" ? "source" : name))
    }
  }
  const pushStreamEvent = (state: LuaState, stream: PanelStream, event: object, encounterId: string, selected: boolean) => {
    pushEventTable(state, event, 0)
    eventIndices.set(lua.lua_topointer(state, -1) as object, (event as { index: number }).index)
    pushString(state, stream); lua.lua_setfield(state, -2, key("stream"))
    pushNumber(state, (event as { offsetMilli: number }).offsetMilli); lua.lua_setfield(state, -2, key("offsetMs"))
    pushString(state, encounterId); lua.lua_setfield(state, -2, key("encounterId"))
    pushBoolean(state, selected); lua.lua_setfield(state, -2, key("selected"))
  }
  const callRef = (ref: number, selfId: string | null, args: unknown[]) => {
    lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, ref); let count = 0
    if (selfId) { makeObject(L, selfId); count++ }
    for (const arg of args) { pushArgument(L, arg); count++ }
    protectedCall(L, count, 0, limits.callbackInstructions)
  }
  const flush = () => { ensureActive(); return operations.splice(0) }
  installGlobals()

  return {
    start() { ensureActive(); const source = options.sources[options.entrypoint]; if (source === undefined) fail(`entrypoint '${options.entrypoint}' not found`); loadChunk(L, source, options.entrypoint); protectedCall(L, 0, 0, limits.startupInstructions); const batch = flush(); if (batch.length) options.emitBatch?.(batch); return batch },
    event(event: GuideEvent) {
      ensureActive(); const ref = callbacks.get(`${event.id}:${event.event}`); if (ref === undefined) throw new GuideLuaError(`unknown callback '${event.id}:${event.event}'`)
      handlingClick = event.event === "click"
      try { callRef(ref, event.id, event.args ?? []) } finally { handlingClick = false }
    },
    /** The time range Lua asked for during the last click, if any; null clears it. Taking it resets it. */
    takeTimeRangeRequest(): { range: PanelTimeRange | null } | undefined { const request = timeRangeRequest; timeRangeRequest = undefined; return request },
    /**
     * Tells Lua the page's current time range, read with Chronicle.GetTimeRange. When it differs
     * from what Lua last saw, calls Chronicle.OnTimeRangeChanged(startMs, endMs). A range this
     * module just set is already current, so its own SetTimeRange does not echo back.
     */
    setTimeRange(range: PanelTimeRange | null) {
      ensureActive()
      const next = range && (range.startMs !== null || range.endMs !== null) ? { ...range } : null
      if (next?.startMs === timeRange?.startMs && next?.endMs === timeRange?.endMs) return
      timeRange = next
      if (timeRangeCallback !== undefined) callRef(timeRangeCallback, null, [next?.startMs ?? null, next?.endMs ?? null])
    },
    /** The Replay time Lua asked for during the last click, if any. Taking it resets it. */
    takeReplayTimeRequest(): { ms: number } | undefined { const request = replayTimeRequest; replayTimeRequest = undefined; return request },
    /**
     * Tells Lua the Replay playhead (ms from encounter start, or null when Replay is off), read with
     * Chronicle.GetReplayTime. When it differs from what Lua last saw, calls Chronicle.OnReplayTime(ms).
     */
    setReplayTime(ms: number | null) {
      ensureActive()
      if (ms === replayTime) return
      replayTime = ms
      if (replayTimeCallback !== undefined) callRef(replayTimeCallback, null, [ms])
    },
    /** The viewer closed a Breakout: Lua sees it hidden, then OnClose runs. */
    close(nodeId: string) {
      ensureActive()
      const object = objects.get(nodeId)
      if (!object || object.kind !== "breakout" || !object.shown) return
      object.shown = false
      setProps(nodeId, { visible: false })
      const ref = callbacks.get(`${nodeId}:close`)
      if (ref !== undefined) callRef(ref, nodeId, [])
    },
    /** Spell IDs Lua asked for since the last call. Taking them resets the list. */
    takeSpellRequests(): number[] { const ids = [...spellRequests]; spellRequests.clear(); return ids },
    /** Answers from the host; null or a missing name means unknown. Runs each waiting GetSpell callback. */
    deliverSpells(answers: ReadonlyArray<{ id: number; spell: PanelSpellInfo | null }>) {
      ensureActive()
      for (const { id, spell } of answers) {
        const waiting = spellWaiters.get(id)
        if (!waiting) continue
        spellWaiters.delete(id); spellWaiterCount -= waiting.length
        spells.set(id, spell)
        try {
          for (const ref of waiting) {
            lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, ref); pushSpell(L, spell)
            protectedCall(L, 1, 0, limits.callbackInstructions)
          }
        } finally { for (const ref of waiting) lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, ref) }
      }
    },
    resize(width: number, height: number) { ensureActive(); const ref = callbacks.get(`${UI_ROOT_ID}:resize`); if (ref !== undefined) callRef(ref, UI_ROOT_ID, [width, height]) },
    timer(id: number) { ensureActive(); const ref = timers.get(id); if (ref === undefined) throw new GuideLuaError(`unknown timer '${id}'`); timers.delete(id); callRef(ref, null, []); lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, ref) },
    panelEvent(raw: unknown) {
      ensureActive()
      if (!options.panelStreams) throw new GuideLuaError("panel profile is not enabled")
      const event: PanelEvent = validatePanelEvent(raw, [...allowedPanelStreams])
      for (const ref of [panelCallbacks.get(event.stream), anyEventCallback]) {
        if (ref === undefined) continue
        lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, ref)
        lua.lua_createtable(L, 0, 7)
        for (const [key, value] of Object.entries(event)) { pushArgument(L, value); setField(L, -2, key) }
        protectedCall(L, 1, 0, limits.callbackInstructions)
      }
    },
    /**
     * Delivers one decoded stream event straight from the cursor's reusable object: every field becomes a
     * Lua field, without an intermediate copy. Skipped when no callback wants the stream.
     */
    panelStreamEvent(stream: PanelStream, event: object, encounterId: string, selected: boolean) {
      ensureActive()
      if (!allowedPanelStreams.has(stream)) throw new GuideLuaError(`panel stream '${stream}' is not allowed`)
      const ref = panelCallbacks.get(stream)
      if (ref === undefined && anyEventCallback === undefined) return
      pushStreamEvent(L, stream, event, encounterId, selected)
      if (ref !== undefined) {
        lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, ref); lua.lua_pushvalue(L, -2)
        protectedCall(L, 1, 0, limits.callbackInstructions)
      }
      if (anyEventCallback !== undefined) {
        lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, anyEventCallback); lua.lua_pushvalue(L, -2)
        protectedCall(L, 1, 0, limits.callbackInstructions)
      }
      lua.lua_pop(L, 1)
    },
    /** Whether Lua called Panel:StopEvents; the host then delivers no more events and completes the replay. */
    stopEventsRequested() { return eventsStopped },
    panelComplete() {
      ensureActive()
      if (!options.panelStreams) throw new GuideLuaError("panel profile is not enabled")
      if (completeCallback !== undefined) callRef(completeCallback, null, [])
    },
    flush,
    stop() { if (stopped) return; for (const ref of callbacks.values()) lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, ref); for (const ref of timers.values()) lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, ref); for (const ref of modules.values()) lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, ref); for (const ref of panelCallbacks.values()) lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, ref); if (completeCallback !== undefined) lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, completeCallback); completeCallback = undefined; if (anyEventCallback !== undefined) lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, anyEventCallback); anyEventCallback = undefined; if (timeRangeCallback !== undefined) lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, timeRangeCallback); timeRangeCallback = undefined; if (replayTimeCallback !== undefined) lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, replayTimeCallback); replayTimeCallback = undefined; for (const refs of spellWaiters.values()) for (const ref of refs) lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, ref); spellWaiters.clear(); spellRequests.clear(); callbacks.clear(); timers.clear(); modules.clear(); panelCallbacks.clear(); objects.clear(); operations.length = 0; lua.lua_close(L); stopped = true },
    stats() { return { callbacks: callbacks.size, objects: Math.max(0, objects.size - 1), operations: operations.length, timers: timers.size, stopped } },
  }
}
