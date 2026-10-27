import { lauxlib, lua, lualib, to_luastring } from "fengari"
import { MAX_CANVAS_SIZE, UI_ROOT_ID } from "../protocol/scene"
import type { GuideCapability, NodeKind, SceneOperation } from "../protocol/types"
import { trustedLuaModule, isReservedLuaPath } from "./trustedModules"
import { PANEL_STREAMS, validatePanelEvent, type PanelEvent, type PanelStream } from "./panelEvents"
import type { PanelUnit, PanelUnits } from "./panelUnits"

const encoder = new TextEncoder()
const UI_KINDS = new Map<string, NodeKind>([["Frame", "frame"], ["FontString", "text"], ["Texture", "texture"], ["Button", "button"]])
const MAP_KINDS = new Map<string, NodeKind>([
  ["CreateUnit", "unit"], ["CreateUnitMarker", "unit"], ["CreateIcon", "icon"], ["CreateText", "map-text"],
  ["CreateLine", "line"], ["CreateArrow", "arrow"], ["CreateCircle", "circle"], ["CreateCone", "cone"], ["CreatePolygon", "polygon"],
])
const ANCHORS: Record<string, string> = {
  TOPLEFT: "top-left", TOP: "top", TOPRIGHT: "top-right", LEFT: "left", CENTER: "center",
  RIGHT: "right", BOTTOMLEFT: "bottom-left", BOTTOM: "bottom", BOTTOMRIGHT: "bottom-right",
}

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
interface ObjectState { kind: NodeKind | "root"; shown: boolean }

const SUPPORTED_PROPS: Record<NodeKind, ReadonlySet<string>> = Object.fromEntries([
  ["frame", ["x", "y", "width", "height", "anchor", "visible", "alpha", "zIndex", "color", "backgroundColor", "borderColor"]],
  ["text", ["x", "y", "width", "height", "anchor", "visible", "alpha", "zIndex", "text", "fontSize", "color", "align", "backgroundColor", "borderColor"]],
  ["texture", ["x", "y", "width", "height", "anchor", "visible", "alpha", "zIndex", "asset", "tint", "borderColor"]],
  ["button", ["x", "y", "width", "height", "anchor", "visible", "alpha", "zIndex", "text", "enabled", "color", "backgroundColor", "borderColor"]],
  ["unit", ["visible", "alpha", "x", "y", "size", "unit", "label", "color", "facing", "entry", "role"]],
  ["icon", ["visible", "alpha", "x", "y", "size", "asset", "label", "color", "facing"]],
  ["map-text", ["visible", "alpha", "x", "y", "text", "fontSize", "color", "align"]],
  ["line", ["visible", "alpha", "points", "color", "width"]],
  ["arrow", ["visible", "alpha", "points", "color", "width", "headSize"]],
  ["circle", ["visible", "alpha", "x", "y", "radius", "color", "fillColor", "width"]],
  ["cone", ["visible", "alpha", "x", "y", "radius", "facing", "angle", "color", "fillColor", "width"]],
  ["polygon", ["visible", "alpha", "points", "color", "fillColor", "width"]],
].map(([kind, props]) => [kind, new Set(props)])) as Record<NodeKind, ReadonlySet<string>>

function defaultProps(kind: NodeKind): Record<string, unknown> {
  switch (kind) {
    case "frame": return { x: 0, y: 0, width: 1, height: 1, anchor: "center", visible: true }
    case "text": return { x: 0, y: 0, text: " ", fontSize: 14, color: "#ffffffff", anchor: "center", visible: true }
    case "texture": return { x: 0, y: 0, width: 1, height: 1, asset: "unset", anchor: "center", visible: true }
    case "button": return { x: 0, y: 0, width: 1, height: 1, text: " ", anchor: "center", visible: true }
    case "unit": return { x: 0, y: 0, size: 1, unit: "unknown", visible: true }
    case "icon": return { x: 0, y: 0, size: 1, asset: "unset", visible: true }
    case "map-text": return { x: 0, y: 0, text: " ", fontSize: 14, color: "#ffffffff", visible: true }
    case "line": return { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#ffffffff", width: 1, visible: true }
    case "arrow": return { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#ffffffff", width: 1, headSize: 1, visible: true }
    case "circle": return { x: 0, y: 0, radius: 0.1, color: "#ffffffff", width: 1, visible: true }
    case "cone": return { x: 0, y: 0, radius: 0.1, facing: 0, angle: 1, color: "#ffffffff", width: 1, visible: true }
    case "polygon": return { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], color: "#ffffffff", width: 1, visible: true }
  }
}

export function createGuideRuntime(options: GuideRuntimeOptions) {
  const limits = { ...DEFAULT_LIMITS, ...options.limits }
  const capabilities = new Set<GuideCapability>(options.capabilities ?? ["ui", "map", "input", "timers"])
  const L = lauxlib.luaL_newstate()
  const operations: SceneOperation[] = []
  const objects = new Map<string, ObjectState>([[UI_ROOT_ID, { kind: "root", shown: true }]])
  let canvas: { width: number | null; height: number | null } = { width: null, height: null }
  const callbacks = new Map<string, number>()
  const timers = new Map<number, number>()
  const modules = new Map<string, number>()
  const panelCallbacks = new Map<PanelStream, number>()
  let completeCallback: number | undefined // Panel:OnComplete, called once after the host's last event.
  const allowedPanelStreams = new Set(options.panelStreams ?? [])
  if ([...allowedPanelStreams].some((stream) => !PANEL_STREAMS.includes(stream))) throw new GuideLuaError("unsupported panel stream")
  if (Object.keys(options.sources).some((path) => isReservedLuaPath(path.toLowerCase()))) throw new GuideLuaError("reserved Chronicle module path")
  let nextObjectId = 1
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
  const pushString = (state: LuaState, value: string) => lua.lua_pushstring(state, to_luastring(value))
  const setField = (state: LuaState, index: number, name: string) => lua.lua_setfield(state, index, to_luastring(name))
  const pushBoolean = (state: LuaState, value: boolean) => lua.lua_pushboolean(state, value ? 1 : 0)
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

  function releaseCallback(key: string) {
    const ref = callbacks.get(key)
    if (ref !== undefined) { lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, ref); callbacks.delete(key) }
  }
  function setScript(state: LuaState) {
    if (!capabilities.has("input")) luaError(state, "guide did not declare the input capability")
    const id = objectIdAt(state)
    const script = stringAt(state, 2, "script")
    const event = script === "OnClick" ? "click" : script === "OnSizeChanged" ? "resize" : null
    if (!event) luaError(state, `unsupported script '${script}'`)
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
    registerFunction(state, "SetParent", (inner) => { const objectId = objectIdAt(inner); const parentId = objectIdAt(inner, 2); addOperation({ op: "set", id: objectId, parentId, props: {} }); return 0 })
    registerFunction(state, "SetPoint", propertyMethod((inner) => {
      const rawAnchor = stringAt(inner, 2, "anchor").toUpperCase(); const anchor = ANCHORS[rawAnchor]
      if (!anchor) luaError(inner, `unsupported anchor '${rawAnchor}'`)
      return { anchor, x: lua.lua_isnoneornil(inner, 5) ? 0 : numberAt(inner, 5), y: lua.lua_isnoneornil(inner, 6) ? 0 : numberAt(inner, 6) }
    }))
    registerFunction(state, "SetSize", propertyMethod((inner) => {
      const kind = kindAt(objectIdAt(inner))
      const width = numberAt(inner, 2); const height = numberAt(inner, 3)
      if (kind === "unit" || kind === "icon") return { size: Math.max(width, height) }
      if (kind === "frame" || kind === "text" || kind === "texture" || kind === "button" || kind === "root") return { width, height }
      return luaError(inner, `SetSize is not supported for ${kind}`)
    }))
    registerFunction(state, "SetWidth", propertyMethod((inner) => ({ width: numberAt(inner, 2) })))
    registerFunction(state, "SetHeight", propertyMethod((inner) => ({ height: numberAt(inner, 2) })))
    registerFunction(state, "SetText", propertyMethod((inner) => ({ text: stringAt(inner, 2, "text") })))
    registerFunction(state, "SetTexture", propertyMethod((inner) => kindAt(objectIdAt(inner)) === "texture" ? { asset: stringAt(inner, 2, "asset") } : { asset: stringAt(inner, 2, "asset") }))
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
    registerFunction(state, "Show", (inner) => { const objectId = objectIdAt(inner); objects.get(objectId)!.shown = true; setProps(objectId, { visible: true }); return 0 })
    registerFunction(state, "Hide", (inner) => { const objectId = objectIdAt(inner); objects.get(objectId)!.shown = false; setProps(objectId, { visible: false }); return 0 })
    registerFunction(state, "IsShown", (inner) => { pushBoolean(inner, objects.get(objectIdAt(inner))!.shown); return 1 })
    registerFunction(state, "Destroy", (inner) => {
      const objectId = objectIdAt(inner); if (objectId === UI_ROOT_ID) luaError(inner, "UIParent cannot be destroyed")
      objects.delete(objectId); for (const key of [...callbacks.keys()]) if (key.startsWith(`${objectId}:`)) releaseCallback(key)
      addOperation({ op: "destroy", id: objectId }); return 0
    })
    registerFunction(state, "SetScript", setScript)
    registerFunction(state, "CreateFontString", childCreator("text")); registerFunction(state, "CreateTexture", childCreator("texture"))
    return 1
  }
  const createObject = (state: LuaState, kind: NodeKind, id: string, parentId: string | null = null) => {
    if (objects.size - 1 >= limits.maxObjects) luaError(state, "object limit exceeded")
    if (objects.has(id)) luaError(state, `duplicate object '${id}'`)
    objects.set(id, { kind, shown: true }); addOperation({ op: "create", id, kind, parentId, props: defaultProps(kind) })
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
        const stream = stringAt(state, lua.lua_istable(state, 1) ? 2 : 1) as PanelStream
        const index = lua.lua_istable(state, 1) ? 3 : 2
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
    else if (typeof value === "number" && Number.isSafeInteger(value)) lua.lua_pushinteger(state, value)
    else if (typeof value === "number" && Number.isFinite(value)) lua.lua_pushnumber(state, value)
    else if (typeof value === "boolean") pushBoolean(state, value)
    else fail("unsupported callback argument")
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
    event(event: GuideEvent) { ensureActive(); const ref = callbacks.get(`${event.id}:${event.event}`); if (ref === undefined) throw new GuideLuaError(`unknown callback '${event.id}:${event.event}'`); callRef(ref, event.id, event.args ?? []) },
    resize(width: number, height: number) { ensureActive(); const ref = callbacks.get(`${UI_ROOT_ID}:resize`); if (ref !== undefined) callRef(ref, UI_ROOT_ID, [width, height]) },
    timer(id: number) { ensureActive(); const ref = timers.get(id); if (ref === undefined) throw new GuideLuaError(`unknown timer '${id}'`); timers.delete(id); callRef(ref, null, []); lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, ref) },
    panelEvent(raw: unknown) {
      ensureActive()
      if (!options.panelStreams) throw new GuideLuaError("panel profile is not enabled")
      const event: PanelEvent = validatePanelEvent(raw, [...allowedPanelStreams])
      const ref = panelCallbacks.get(event.stream)
      if (ref === undefined) return
      lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, ref)
      lua.lua_createtable(L, 0, 7)
      for (const [key, value] of Object.entries(event)) { pushArgument(L, value); setField(L, -2, key) }
      protectedCall(L, 1, 0, limits.callbackInstructions)
    },
    panelComplete() {
      ensureActive()
      if (!options.panelStreams) throw new GuideLuaError("panel profile is not enabled")
      if (completeCallback !== undefined) callRef(completeCallback, null, [])
    },
    flush,
    stop() { if (stopped) return; for (const ref of callbacks.values()) lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, ref); for (const ref of timers.values()) lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, ref); for (const ref of modules.values()) lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, ref); for (const ref of panelCallbacks.values()) lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, ref); if (completeCallback !== undefined) lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, completeCallback); completeCallback = undefined; callbacks.clear(); timers.clear(); modules.clear(); panelCallbacks.clear(); objects.clear(); operations.length = 0; lua.lua_close(L); stopped = true },
    stats() { return { callbacks: callbacks.size, objects: Math.max(0, objects.size - 1), operations: operations.length, timers: timers.size, stopped } },
  }
}
