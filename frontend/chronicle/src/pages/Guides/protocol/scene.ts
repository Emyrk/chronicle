import { NODE_KINDS, type GuideEvent, type NodeKind, type RetainedScene, type SceneNode, type SceneOperation } from "./types"

export const UI_ROOT_ID = "__chronicle_ui_root__"
export const MAX_NODES = 2_000
export const MAX_OPERATIONS = 2_000
export const MAX_NESTING = 64
export const MAX_STRING_LENGTH = 4_096
export const MAX_ID_LENGTH = 128
export const MAX_POINTS = 256
/** Largest content size UIParent:SetSize accepts, in pixels. */
export const MAX_CANVAS_SIZE = 16_384

const MAP_KINDS = new Set<NodeKind>(["unit", "icon", "map-text", "line", "arrow", "circle", "cone", "polygon"])
const ANCHORS = new Set(["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"])
const COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const COMMON_UI = ["x", "y", "anchor", "visible", "alpha", "zIndex"]
const COMMON_MAP = ["visible", "alpha"]

const PROPERTIES: Record<NodeKind, readonly string[]> = {
  frame: [...COMMON_UI, "width", "height", "color", "backgroundColor", "borderColor"],
  text: [...COMMON_UI, "width", "height", "text", "fontSize", "color", "align", "backgroundColor", "borderColor"],
  texture: [...COMMON_UI, "width", "height", "asset", "tint", "borderColor"],
  button: [...COMMON_UI, "width", "height", "text", "enabled", "color", "backgroundColor", "borderColor"],
  unit: [...COMMON_MAP, "x", "y", "size", "unit", "label", "color", "facing", "entry", "role"],
  icon: [...COMMON_MAP, "x", "y", "size", "asset", "label", "color", "facing"],
  "map-text": [...COMMON_MAP, "x", "y", "text", "fontSize", "color", "align"],
  line: [...COMMON_MAP, "points", "color", "width"],
  arrow: [...COMMON_MAP, "points", "color", "width", "headSize"],
  circle: [...COMMON_MAP, "x", "y", "radius", "color", "fillColor", "width"],
  cone: [...COMMON_MAP, "x", "y", "radius", "facing", "angle", "color", "fillColor", "width"],
  polygon: [...COMMON_MAP, "points", "color", "fillColor", "width"],
}

const REQUIRED: Record<NodeKind, readonly string[]> = {
  frame: ["x", "y", "width", "height", "anchor"],
  text: ["x", "y", "text", "fontSize", "color", "anchor"],
  texture: ["x", "y", "width", "height", "asset", "anchor"],
  button: ["x", "y", "width", "height", "text", "anchor"],
  unit: ["x", "y", "size", "unit"],
  icon: ["x", "y", "size", "asset"],
  "map-text": ["x", "y", "text", "fontSize", "color"],
  line: ["points", "color", "width"],
  arrow: ["points", "color", "width", "headSize"],
  circle: ["x", "y", "radius", "color", "width"],
  cone: ["x", "y", "radius", "facing", "angle", "color", "width"],
  polygon: ["points", "color", "width"],
}

export class SceneValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SceneValidationError"
  }
}

class ImmutableMap<K, V> implements ReadonlyMap<K, V> {
  readonly #values: Map<K, V>
  constructor(entries?: Iterable<readonly [K, V]>) { this.#values = new Map(entries) }
  get size() { return this.#values.size }
  get(key: K) { return this.#values.get(key) }
  has(key: K) { return this.#values.has(key) }
  forEach(callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown) {
    this.#values.forEach((value, key) => callbackfn.call(thisArg, value, key, this))
  }
  entries() { return this.#values.entries() }
  keys() { return this.#values.keys() }
  values() { return this.#values.values() }
  [Symbol.iterator]() { return this.#values[Symbol.iterator]() }
  get [Symbol.toStringTag]() { return "ImmutableMap" }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new SceneValidationError(`${label} must be an object`)
  return value as Record<string, unknown>
}

function exact(value: Record<string, unknown>, fields: readonly string[], label: string) {
  for (const key of Object.keys(value)) if (!fields.includes(key)) throw new SceneValidationError(`${label} has unknown property ${key}`)
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new SceneValidationError(`${label} must be a finite number`)
  return value
}

function bounded(value: unknown, min: number, max: number, label: string): number {
  const result = finite(value, label)
  if (result < min || result > max) throw new SceneValidationError(`${label} must be between ${min} and ${max}`)
  return result
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

function string(value: unknown, label: string, max = MAX_STRING_LENGTH): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max || hasControlCharacters(value)) {
    throw new SceneValidationError(`${label} must be a non-empty safe string of at most ${max} characters`)
  }
  return value
}

/** Display text may be empty (SetText("") clears a label) and may contain newlines and tabs. */
function displayText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > MAX_STRING_LENGTH || hasControlCharacters(value.replace(/[\n\t]/g, ""))) {
    throw new SceneValidationError(`${label} must be text of at most ${MAX_STRING_LENGTH} characters without control characters other than newlines and tabs`)
  }
  return value
}

function id(value: unknown, label = "id"): string { return string(value, label, MAX_ID_LENGTH) }

function color(value: unknown, label: string): string {
  if (typeof value !== "string" || !COLOR.test(value)) throw new SceneValidationError(`${label} must be a hex color`)
  return value
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new SceneValidationError(`${label} must be a boolean`)
  return value
}

function validatePoint(value: unknown, label: string) {
  const point = record(value, label)
  exact(point, ["x", "y"], label)
  bounded(point.x, 0, 1, `${label}.x`)
  bounded(point.y, 0, 1, `${label}.y`)
}

function validateProps(kind: NodeKind, input: unknown, partial: boolean): Record<string, unknown> {
  const props = record(input, `${kind} props`)
  exact(props, PROPERTIES[kind], `${kind} props`)
  if (!partial) for (const key of REQUIRED[kind]) if (!(key in props)) throw new SceneValidationError(`${kind} props require ${key}`)

  for (const [key, value] of Object.entries(props)) {
    if (key === "text") displayText(value, `${kind}.text`)
    else if (["asset", "unit", "label", "role"].includes(key)) string(value, `${kind}.${key}`)
    else if (["color", "fillColor", "tint", "backgroundColor", "borderColor"].includes(key)) color(value, `${kind}.${key}`)
    else if (["visible", "enabled"].includes(key)) boolean(value, `${kind}.${key}`)
    else if (key === "alpha") bounded(value, 0, 1, `${kind}.alpha`)
    else if (key === "anchor") {
      if (typeof value !== "string" || !ANCHORS.has(value)) throw new SceneValidationError(`${kind}.anchor is invalid`)
    } else if (key === "align") {
      if (value !== "left" && value !== "center" && value !== "right") throw new SceneValidationError(`${kind}.align is invalid`)
    } else if (key === "points") {
      if (!Array.isArray(value) || value.length > MAX_POINTS) throw new SceneValidationError(`${kind}.points must be an array of at most ${MAX_POINTS} points`)
      const minimum = kind === "polygon" ? 3 : 2
      const maximum = kind === "polygon" ? MAX_POINTS : 2
      if (value.length < minimum || value.length > maximum) throw new SceneValidationError(`${kind}.points must contain ${minimum}${minimum === maximum ? "" : `-${maximum}`} points`)
      value.forEach((point, index) => validatePoint(point, `${kind}.points[${index}]`))
    } else if (key === "x" || key === "y") {
      if (MAP_KINDS.has(kind)) bounded(value, 0, 1, `${kind}.${key}`)
      else bounded(value, -1_000_000, 1_000_000, `${kind}.${key}`)
    } else if (key === "facing") bounded(value, 0, Math.PI * 2, `${kind}.facing`)
    else if (key === "angle") bounded(value, 0.001, Math.PI * 2, `${kind}.angle`)
    else if (key === "radius") bounded(value, 0.000001, 1, `${kind}.radius`)
    else if (key === "entry") {
      const entry = bounded(value, 1, 0x7fffffff, `${kind}.entry`)
      if (!Number.isInteger(entry)) throw new SceneValidationError(`${kind}.entry must be an integer`)
    } else if (["width", "height", "size", "fontSize", "headSize"].includes(key)) bounded(value, 0.000001, 16_384, `${kind}.${key}`)
    else finite(value, `${kind}.${key}`)
  }
  return structuredClone(props)
}

function cloneNode(node: SceneNode): SceneNode {
  return Object.freeze({ ...node, props: Object.freeze(structuredClone(node.props)), listeners: Object.freeze([...node.listeners]) })
}

function operationRecord(input: unknown): Record<string, unknown> { return record(input, "operation") }

export function validateSceneOperation(input: unknown): SceneOperation {
  const operation = operationRecord(input)
  if (typeof operation.op !== "string") throw new SceneValidationError("operation.op is required")
  switch (operation.op) {
    case "create": {
      exact(operation, ["op", "id", "kind", "parentId", "props"], "create operation")
      const kind = operation.kind
      if (typeof kind !== "string" || !NODE_KINDS.includes(kind as NodeKind)) throw new SceneValidationError("create operation kind is invalid")
      const parentId = operation.parentId === null ? null : id(operation.parentId, "parentId")
      return { op: "create", id: id(operation.id), kind: kind as NodeKind, parentId, props: validateProps(kind as NodeKind, operation.props, false) }
    }
    case "set": {
      exact(operation, ["op", "id", "parentId", "props"], "set operation")
      const result: SceneOperation = { op: "set", id: id(operation.id), props: structuredClone(record(operation.props, "set props")) }
      if ("parentId" in operation) result.parentId = operation.parentId === null ? null : id(operation.parentId, "parentId")
      return result
    }
    case "listen":
      exact(operation, ["op", "id", "event", "enabled"], "listen operation")
      if (operation.event !== "click") throw new SceneValidationError("listen event is invalid")
      return { op: "listen", id: id(operation.id), event: "click", enabled: boolean(operation.enabled, "listen.enabled") }
    case "destroy":
      exact(operation, ["op", "id"], "destroy operation")
      return { op: "destroy", id: id(operation.id) }
    case "camera":
      exact(operation, ["op", "x", "y", "zoom"], "camera operation")
      return { op: "camera", x: bounded(operation.x, 0, 1, "camera.x"), y: bounded(operation.y, 0, 1, "camera.y"), zoom: bounded(operation.zoom, 0.1, 20, "camera.zoom") }
    case "chapter":
      exact(operation, ["op", "chapter"], "chapter operation")
      return { op: "chapter", chapter: id(operation.chapter, "chapter") }
    case "canvas": {
      exact(operation, ["op", "width", "height"], "canvas operation")
      const size = (value: unknown, label: string) => value === null ? null : bounded(value, 1, MAX_CANVAS_SIZE, label)
      return { op: "canvas", width: size(operation.width, "canvas.width"), height: size(operation.height, "canvas.height") }
    }
    default:
      throw new SceneValidationError(`unknown operation ${operation.op}`)
  }
}

export function createInitialScene(): RetainedScene {
  return Object.freeze({ nodes: new ImmutableMap<string, SceneNode>(), camera: Object.freeze({ x: 0.5, y: 0.5, zoom: 1 }), chapter: null, canvas: Object.freeze({ width: null, height: null }) })
}

function assertParent(nodes: Map<string, SceneNode>, nodeId: string, kind: NodeKind, parentId: string | null) {
  if (MAP_KINDS.has(kind)) {
    if (parentId !== null) throw new SceneValidationError(`${kind} nodes cannot have a parent`)
    return
  }
  if (parentId === null) throw new SceneValidationError(`${kind} nodes require a UI parent`)
  if (parentId !== UI_ROOT_ID) {
    const parent = nodes.get(parentId)
    if (!parent) throw new SceneValidationError(`unknown ID ${parentId}`)
    if (parent.kind !== "frame") throw new SceneValidationError("UI nodes may only be parented to frames")
  }

  const visited = new Set([nodeId])
  let current: string | null = parentId
  let depth = 0
  while (current !== UI_ROOT_ID) {
    if (current === null) throw new SceneValidationError("invalid UI parent chain")
    if (visited.has(current)) throw new SceneValidationError("parent cycle detected")
    visited.add(current)
    const parent = nodes.get(current)
    if (!parent) throw new SceneValidationError(`unknown ID ${current}`)
    current = parent.parentId
    depth += 1
    if (depth >= MAX_NESTING) throw new SceneValidationError(`excessive nesting exceeds ${MAX_NESTING}`)
  }
}

function descendants(nodes: Map<string, SceneNode>, root: string): Set<string> {
  const result = new Set([root])
  let changed = true
  while (changed) {
    changed = false
    for (const node of nodes.values()) if (node.parentId !== null && result.has(node.parentId) && !result.has(node.id)) {
      result.add(node.id)
      changed = true
    }
  }
  return result
}

export function applySceneBatch(scene: RetainedScene, rawOperations: readonly unknown[]): RetainedScene {
  if (!Array.isArray(rawOperations)) throw new SceneValidationError("operations must be an array")
  if (rawOperations.length > MAX_OPERATIONS) throw new SceneValidationError(`batch exceeds ${MAX_OPERATIONS} operations`)
  const operations = rawOperations.map(validateSceneOperation)
  const nodes = new Map<string, SceneNode>()
  for (const [key, value] of scene.nodes) nodes.set(key, cloneNode(value))
  let camera = { ...scene.camera }
  let chapter = scene.chapter
  let canvas = scene.canvas

  for (const operation of operations) {
    if (operation.op === "camera") {
      camera = { x: operation.x, y: operation.y, zoom: operation.zoom }
      continue
    }
    if (operation.op === "chapter") {
      chapter = operation.chapter
      continue
    }
    if (operation.op === "canvas") {
      canvas = Object.freeze({ width: operation.width, height: operation.height })
      continue
    }
    if (operation.id === UI_ROOT_ID) throw new SceneValidationError(`${UI_ROOT_ID} is reserved`)
    if (operation.op === "create") {
      if (nodes.has(operation.id)) throw new SceneValidationError(`duplicate ID ${operation.id}`)
      if (nodes.size >= MAX_NODES) throw new SceneValidationError(`scene exceeds ${MAX_NODES} nodes`)
      assertParent(nodes, operation.id, operation.kind, operation.parentId)
      nodes.set(operation.id, cloneNode({ id: operation.id, kind: operation.kind, parentId: operation.parentId, props: operation.props, listeners: [] }))
    } else if (operation.op === "set") {
      const existing = nodes.get(operation.id)
      if (!existing) throw new SceneValidationError(`unknown ID ${operation.id}`)
      const props = validateProps(existing.kind, operation.props, true)
      const parentId = operation.parentId === undefined ? existing.parentId : operation.parentId
      assertParent(nodes, existing.id, existing.kind, parentId)
      nodes.set(existing.id, cloneNode({ ...existing, parentId, props: { ...existing.props, ...props } }))
    } else if (operation.op === "listen") {
      const existing = nodes.get(operation.id)
      if (!existing) throw new SceneValidationError(`unknown ID ${operation.id}`)
      if (MAP_KINDS.has(existing.kind) || (existing.kind !== "button" && existing.kind !== "frame" && existing.kind !== "text" && existing.kind !== "texture")) {
        throw new SceneValidationError(`${existing.kind} does not support events`)
      }
      const listeners = new Set<GuideEvent>(existing.listeners)
      if (operation.enabled) listeners.add(operation.event)
      else listeners.delete(operation.event)
      nodes.set(existing.id, cloneNode({ ...existing, listeners: [...listeners] }))
    } else {
      if (!nodes.has(operation.id)) throw new SceneValidationError(`unknown ID ${operation.id}`)
      for (const childId of descendants(nodes, operation.id)) nodes.delete(childId)
    }
  }

  return Object.freeze({ nodes: new ImmutableMap(nodes), camera: Object.freeze(camera), chapter, canvas })
}
