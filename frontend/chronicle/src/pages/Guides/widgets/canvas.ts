import { bounded, color, displayText, exact, record, SceneValidationError, string } from "../protocol/validators"
import { arrayLength, fieldColor, fieldOptionalNumber, fieldString, requireTable, withElement } from "./optionTypes"
import { defineWidget, type LuaReadContext, type LuaState, type OptionType } from "./types"

/** Shapes in one SetShapes call. A 40-player radar with mobs, lines and arcs needs about 600. */
export const MAX_CANVAS_SHAPES = 4_000
const MAX_COORDINATE = 16_384
const MAX_STROKE = 256
const MAX_GLOW = 64
const MAX_DASH = 1_024
const MAX_ANGLE = 1_000
const ICON_NAME = /^[a-z0-9][a-z0-9_-]{0,127}$/

export const CANVAS_SHAPE_KINDS = ["circle", "arc", "pie", "line", "text", "icon"] as const
export type CanvasShapeKind = (typeof CANVAS_SHAPE_KINDS)[number]
const CAPS = ["butt", "round"] as const
const ALIGNS = ["left", "center", "right"] as const

type FieldSpec =
  | { type: "number"; min: number; max: number; optional?: boolean; doc: string }
  | { type: "color"; optional?: boolean; doc: string }
  | { type: "text"; doc: string }
  | { type: "icon"; doc: string }
  | { type: "choice"; values: readonly string[]; doc: string }

const coordinate = (doc: string): FieldSpec => ({ type: "number", min: -MAX_COORDINATE, max: MAX_COORDINATE, doc })
const radius: FieldSpec = { type: "number", min: 0, max: MAX_COORDINATE, doc: "Radius in pixels." }
const angle = (doc: string, optional = false): FieldSpec => ({ type: "number", min: -MAX_ANGLE, max: MAX_ANGLE, optional, doc })
const stroke = (doc: string, optional = false): FieldSpec => ({ type: "number", min: 0, max: MAX_STROKE, optional, doc })

/** Fields every shape accepts. */
const COMMON: Record<string, FieldSpec> = {
  alpha: { type: "number", min: 0, max: 1, optional: true, doc: "Opacity from 0 through 1. Defaults to 1." },
  glow: { type: "number", min: 0, max: MAX_GLOW, optional: true, doc: "Soft glow in the shape's color, this many pixels wide." },
}

/** Each shape kind's own fields. Every field is required unless marked optional. */
const SHAPE_FIELDS: Record<CanvasShapeKind, Record<string, FieldSpec>> = {
  circle: {
    x: coordinate("Center x."), y: coordinate("Center y."), r: radius,
    fill: { type: "color", optional: true, doc: "Fill color. Omit for a ring." },
    stroke: { type: "color", optional: true, doc: "Outline color. Omit for a disc." },
    width: stroke("Outline width in pixels, centered on the radius. Defaults to 1.", true),
  },
  arc: {
    x: coordinate("Center x."), y: coordinate("Center y."), r: radius,
    from: angle("Start angle in radians. 0 points right; angles grow clockwise, so -math.pi/2 is the top."),
    to: angle("End angle in radians. Drawn clockwise when greater than from, counterclockwise when smaller; a full turn or more draws a ring."),
    width: stroke("Stroke width in pixels, centered on the radius."),
    color: { type: "color", doc: "Stroke color." },
    cap: { type: "choice", values: CAPS, doc: "Line ends. Defaults to \"butt\"." },
  },
  pie: {
    x: coordinate("Center x."), y: coordinate("Center y."), r: radius,
    value: { type: "number", min: 0, max: 1, doc: "Filled share from 0 through 1, like a clock hand sweeping clockwise." },
    color: { type: "color", doc: "Color of the filled share." },
    track: { type: "color", optional: true, doc: "Color of the empty share. Omit to leave it empty." },
    start: angle("Angle where the fill starts, in radians. Defaults to -math.pi/2 (the top).", true),
  },
  line: {
    x1: coordinate("Start x."), y1: coordinate("Start y."), x2: coordinate("End x."), y2: coordinate("End y."),
    width: stroke("Width in pixels."),
    color: { type: "color", doc: "Line color." },
    dash: { type: "number", min: 0, max: MAX_DASH, optional: true, doc: "Dash length in pixels. Omit for a solid line." },
    gap: { type: "number", min: 0, max: MAX_DASH, optional: true, doc: "Gap between dashes in pixels. Defaults to the dash length." },
    offset: { type: "number", min: -MAX_COORDINATE, max: MAX_COORDINATE, optional: true, doc: "Shifts the dash pattern along the line; change it over time to make dashes flow." },
    cap: { type: "choice", values: CAPS, doc: "Line ends. Defaults to \"butt\"." },
  },
  text: {
    x: coordinate("Anchor x."), y: coordinate("Vertical middle of the text."),
    text: { type: "text", doc: "The text. Up to 4 KiB; no newlines." },
    size: { type: "number", min: 1, max: 256, optional: true, doc: "Font size in pixels. Defaults to 14." },
    color: { type: "color", optional: true, doc: "Text color. Defaults to white." },
    align: { type: "choice", values: ALIGNS, doc: "Which end of the text sits on x. Defaults to \"left\"." },
  },
  icon: {
    x: coordinate("Center x."), y: coordinate("Center y."), r: radius,
    icon: { type: "icon", doc: "Icon name from Chronicle's dataset CDN, as for Texture:SetIcon, such as \"spell_nature_healingwavelesser\"." },
  },
}

/** LuaLS has one doc per field, so a field whose meaning differs between kinds gets a combined one. */
const SHARED_FIELD_DOCS: Record<string, string> = {
  x: "Center x; for text, the anchor x.",
  y: "Center y; for text, its vertical middle.",
  width: "Stroke width in pixels, centered on the radius for circles and arcs. Defaults to 1 for a circle's outline.",
  color: "Stroke color for arcs and lines, fill for pies, text color (default white) for text.",
}

// Choices are always optional: omitting one means its default.
const isOptional = (field: FieldSpec) => field.type === "choice" || ((field.type === "number" || field.type === "color") && field.optional === true)

export type CanvasShape = { kind: CanvasShapeKind } & Record<string, number | string>

function fieldsOf(kind: CanvasShapeKind): Record<string, FieldSpec> {
  return { ...SHAPE_FIELDS[kind], ...COMMON }
}

/** Fails on any key of the table at `index` that its shape kind does not know, so typos are caught. */
function rejectUnknownFields(context: LuaReadContext, state: LuaState, index: number, allowed: ReadonlySet<string>, label: string) {
  const { lua } = context
  lua.lua_pushnil(state)
  while (lua.lua_next(state, index) !== 0) {
    const name = lua.lua_type(state, -2) === lua.LUA_TSTRING ? context.string(state, -2, `${label} field name`) : null
    lua.lua_pop(state, 1)
    if (name === null || !allowed.has(name)) {
      lua.lua_pop(state, 1)
      context.fail(state, `${label} has no field ${name === null ? "with a non-string key" : `'${name}'`}`)
    }
  }
}

function readField(context: LuaReadContext, state: LuaState, index: number, name: string, field: FieldSpec, label: string): number | string | undefined {
  const fieldLabel = `${label} ${name}`
  switch (field.type) {
    case "number": {
      const value = fieldOptionalNumber(context, state, index, name, fieldLabel)
      if (value === undefined) return field.optional ? undefined : context.fail(state, `${label} needs ${name}`)
      if (!(value >= field.min && value <= field.max)) context.fail(state, `${fieldLabel} must be between ${field.min} and ${field.max}`)
      return value
    }
    case "color": {
      const value = fieldColor(context, state, index, name, fieldLabel)
      if (value === undefined && !field.optional) context.fail(state, `${label} needs ${name}`)
      return value
    }
    case "text": {
      const value = fieldString(context, state, index, name, fieldLabel)
      if (value === undefined) return context.fail(state, `${label} needs ${name}`)
      if (/[\n\r]/.test(value)) context.fail(state, `${fieldLabel} must be one line`)
      return value
    }
    case "icon": {
      const value = fieldString(context, state, index, name, fieldLabel)?.toLowerCase()
      if (value === undefined) return context.fail(state, `${label} needs ${name}`)
      if (!ICON_NAME.test(value)) context.fail(state, `${fieldLabel} must contain only letters, numbers, underscores, or hyphens`)
      return value
    }
    case "choice": {
      const raw = fieldString(context, state, index, name, fieldLabel)
      if (raw === undefined) return undefined
      const match = field.values.find((value) => value.toLowerCase() === raw.toLowerCase())
      if (!match) context.fail(state, `${fieldLabel} must be one of ${field.values.join(", ")}`)
      return match
    }
  }
}

function validateField(value: unknown, field: FieldSpec, label: string) {
  if (value === undefined) {
    if (!isOptional(field)) throw new SceneValidationError(`${label} is required`)
    return
  }
  switch (field.type) {
    case "number": bounded(value, field.min, field.max, label); return
    case "color": color(value, label); return
    case "text":
      displayText(value, label)
      if (/[\n\r]/.test(value as string)) throw new SceneValidationError(`${label} must be one line`)
      return
    case "icon":
      if (!ICON_NAME.test(string(value, label, 128))) throw new SceneValidationError(`${label} must be an icon name`)
      return
    case "choice":
      if (!field.values.includes(value as string)) throw new SceneValidationError(`${label} must be one of ${field.values.join(", ")}`)
  }
}

const canvasShapes: OptionType<CanvasShape[]> = {
  luaType: "ChronicleCanvasShape[]",
  optional: false,
  definitions: [
    `---@alias ChronicleCanvasShapeKind ${CANVAS_SHAPE_KINDS.map((kind) => JSON.stringify(kind)).join("|")}`,
    "",
    "---One shape. `kind` picks which fields apply; colors are \"#rrggbb[aa]\" or {r, g, b, a} with components from 0 through 1.",
    "---Coordinates are pixels from the canvas's top-left corner, y growing downward.",
    "---@class ChronicleCanvasShape",
    "---@field kind ChronicleCanvasShapeKind",
    ...[...new Set(CANVAS_SHAPE_KINDS.flatMap((kind) => Object.keys(fieldsOf(kind))))].map((name) => {
      const kinds = CANVAS_SHAPE_KINDS.filter((kind) => name in fieldsOf(kind))
      const field = fieldsOf(kinds[0])[name]
      const docs = new Set(kinds.map((kind) => fieldsOf(kind)[name].doc))
      const doc = docs.size === 1 ? field.doc : SHARED_FIELD_DOCS[name] ?? [...docs].join(" ")
      const type = field.type === "number" ? "number" : field.type === "color" ? "string|number[]" : field.type === "choice" ? field.values.map((value) => JSON.stringify(value)).join("|") : "string"
      const where = kinds.length === CANVAS_SHAPE_KINDS.length ? "" : ` (${kinds.join(", ")})`
      return `---@field ${name}? ${type}${where} ${doc}`
    }),
  ].join("\n"),
  read(context, state, index, label) {
    requireTable(context, state, index, label)
    const count = arrayLength(context, state, index, MAX_CANVAS_SHAPES, label)
    return Array.from({ length: count }, (_, offset) => withElement(context, state, index, offset + 1, (shapeIndex) => {
      const shapeLabel = `shape ${offset + 1}`
      requireTable(context, state, shapeIndex, shapeLabel)
      const rawKind = fieldString(context, state, shapeIndex, "kind", `${shapeLabel} kind`)
      const kind = CANVAS_SHAPE_KINDS.find((value) => value === rawKind?.toLowerCase())
      if (!kind) return context.fail(state, `${shapeLabel} kind must be one of ${CANVAS_SHAPE_KINDS.join(", ")}`)
      const fields = fieldsOf(kind)
      const kindLabel = `${shapeLabel} (${kind})`
      rejectUnknownFields(context, state, shapeIndex, new Set(["kind", ...Object.keys(fields)]), kindLabel)
      const shape: CanvasShape = { kind }
      for (const [name, field] of Object.entries(fields)) {
        const value = readField(context, state, shapeIndex, name, field, kindLabel)
        if (value !== undefined) shape[name] = value
      }
      return shape
    }))
  },
  validate(value, label) {
    if (!Array.isArray(value) || value.length > MAX_CANVAS_SHAPES) throw new SceneValidationError(`${label} must be an array of at most ${MAX_CANVAS_SHAPES} shapes`)
    value.forEach((rawShape, index) => {
      const shapeLabel = `${label}[${index}]`
      const shape = record(rawShape, shapeLabel)
      if (!(CANVAS_SHAPE_KINDS as readonly unknown[]).includes(shape.kind)) throw new SceneValidationError(`${shapeLabel}.kind must be one of ${CANVAS_SHAPE_KINDS.join(", ")}`)
      const fields = fieldsOf(shape.kind as CanvasShapeKind)
      exact(shape, ["kind", ...Object.keys(fields)], shapeLabel)
      for (const [name, field] of Object.entries(fields)) validateField(shape[name], field, `${shapeLabel}.${name}`)
    })
  },
  example: `{
    { kind = "circle", x = 100, y = 100, r = 60, stroke = "#8c94a8", width = 1, alpha = 0.4 },
    { kind = "circle", x = 100, y = 100, r = 20, fill = {0.2, 0.2, 0.25, 1} },
    { kind = "arc", x = 100, y = 100, r = 80, from = -0.6, to = 0.6, width = 6, color = "#3b7cff", cap = "round", glow = 4 },
    { kind = "pie", x = 150, y = 60, r = 8, value = 0.65, color = "#c79c6e", track = "#c79c6e40" },
    { kind = "line", x1 = 100, y1 = 100, x2 = 150, y2 = 60, width = 2, color = "#4fd38a", dash = 6, gap = 4, offset = 3 },
    { kind = "text", x = 160, y = 60, text = "Thorvald", size = 12, color = "#c79c6e", align = "left" },
    { kind = "icon", x = 100, y = 100, r = 18, icon = "spell_nature_healingwavelesser" },
  }`,
}

export const canvasSpec = defineWidget({
  kind: "canvas",
  luaType: "Canvas",
  helper: "canvas",
  luaClass: "ChronicleCanvas",
  doc: "A drawing surface for circles, rings, arcs, pies, lines, text and round icons. Replace the whole picture with SetShapes whenever it changes; later shapes draw on top of earlier ones.",
  defaultSize: { width: 400, height: 400 },
  defaults: { shapes: [] },
  required: ["shapes"],
  setters: [
    { method: "SetShapes", args: [{ prop: "shapes", type: canvasShapes }], doc: `Replace every shape, drawn in order. At most ${MAX_CANVAS_SHAPES}.` },
  ],
})
