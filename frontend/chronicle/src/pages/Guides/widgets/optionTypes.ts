import { bounded, boolean, color, displayText, finite, SceneValidationError } from "../protocol/validators"
import type { LuaReadContext, LuaState, OptionType } from "./types"

/** Reusable option types for widget setters. Widget-specific structured types live beside their spec. */

/** A boolean argument. Omitting it means `whenOmitted`, so SetArea() turns area on. */
export function flag(whenOmitted = true): OptionType<boolean> {
  return {
    luaType: "boolean",
    optional: true,
    read(context, state, index, label) {
      if (context.lua.lua_isnoneornil(state, index)) return whenOmitted
      if (!context.lua.lua_isboolean(state, index)) context.fail(state, `${label} must be a boolean`)
      return context.lua.lua_toboolean(state, index) !== 0
    },
    validate: (value, label) => { boolean(value, label) },
    example: "true",
  }
}

/** A required number within [min, max]. */
export function number(options: { min: number; max: number; example?: number; integer?: boolean }): OptionType<number> {
  const { min, max, integer = false } = options
  const describe = `between ${min} and ${max}`
  return {
    luaType: integer ? "integer" : "number",
    optional: false,
    read(context, state, index, label) {
      const value = context.number(state, index)
      if (!(value >= min && value <= max)) context.fail(state, `${label} must be ${describe}`)
      if (integer && !Number.isInteger(value)) context.fail(state, `${label} must be a whole number`)
      return value
    },
    validate(value, label) {
      bounded(value, min, max, label)
      if (integer && !Number.isInteger(value)) throw new SceneValidationError(`${label} must be an integer`)
    },
    example: String(options.example ?? min),
  }
}

/** A number, or nil for "fit the data". nil is stored as "auto". */
export function numberOrAuto(): OptionType<number | "auto"> {
  return {
    luaType: "number",
    optional: true,
    read: (context, state, index) => context.lua.lua_isnoneornil(state, index) ? "auto" : context.number(state, index),
    validate: (value, label) => { if (value !== "auto") finite(value, label) },
    example: "100",
  }
}

/** Display text up to 4 KiB; newlines allowed. Optional text treats nil as "" (cleared). */
export function text(options: { optional?: boolean; example?: string } = {}): OptionType<string> {
  const optional = options.optional ?? false
  return {
    luaType: "string",
    optional,
    read: (context, state, index, label) => optional && context.lua.lua_isnoneornil(state, index) ? "" : context.string(state, index, label),
    validate: (value, label) => { displayText(value, label) },
    example: JSON.stringify(options.example ?? "Example"),
  }
}

/** One of a fixed list of strings, matched case-insensitively and stored in its canonical case. */
export function choice<const T extends string>(values: readonly T[], alias: string): OptionType<T> & { values: readonly T[] } {
  return {
    values,
    luaType: alias,
    optional: false,
    definitions: `---@alias ${alias} ${values.map((value) => JSON.stringify(value)).join("|")}`,
    read(context, state, index, label) {
      const raw = context.string(state, index, label)
      const match = values.find((value) => value.toLowerCase() === raw.toLowerCase())
      if (!match) context.fail(state, `${label} must be one of ${values.join(", ")}`)
      return match!
    },
    validate(value, label) {
      if (!(values as readonly unknown[]).includes(value)) throw new SceneValidationError(`${label} must be one of ${values.join(", ")}`)
    },
    example: JSON.stringify(values[0]),
  }
}

// Helpers for structured types that read fields out of Lua tables.

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

export function requireTable(context: LuaReadContext, state: LuaState, index: number, label: string) {
  if (!context.lua.lua_istable(state, index)) context.fail(state, `${label} must be a table`)
}

/** Length of the array part of the table at `index`, failing above `max`. */
export function arrayLength(context: LuaReadContext, state: LuaState, index: number, max: number, label: string): number {
  const length = context.lua.lua_rawlen(state, index) as number
  if (length > max) context.fail(state, `${label} supports at most ${max} entries`)
  return length
}

/** Calls `read` with the absolute stack index of element `i` (1-based), then pops it. */
export function withElement<T>(context: LuaReadContext, state: LuaState, tableIndex: number, i: number, read: (elementIndex: number) => T): T {
  context.lua.lua_rawgeti(state, tableIndex, i)
  const result = read(context.lua.lua_gettop(state))
  context.lua.lua_pop(state, 1)
  return result
}

/** Calls `read` with the absolute stack index of field `field`, then pops it. */
export function withField<T>(context: LuaReadContext, state: LuaState, tableIndex: number, field: string | number, read: (fieldIndex: number) => T): T {
  if (typeof field === "number") context.lua.lua_rawgeti(state, tableIndex, field)
  else context.lua.lua_getfield(state, tableIndex, context.toLuaString(field))
  const result = read(context.lua.lua_gettop(state))
  context.lua.lua_pop(state, 1)
  return result
}

export function fieldNumber(context: LuaReadContext, state: LuaState, tableIndex: number, field: string | number, label: string): number {
  return withField(context, state, tableIndex, field, (index) => {
    if (!context.lua.lua_isnumber(state, index)) context.fail(state, `${label} must be a number`)
    const value = context.lua.lua_tonumber(state, index) as number
    if (!Number.isFinite(value)) context.fail(state, `${label} must be finite`)
    return value
  })
}

export function fieldOptionalNumber(context: LuaReadContext, state: LuaState, tableIndex: number, field: string, label: string): number | undefined {
  const present = withField(context, state, tableIndex, field, (index) => !context.lua.lua_isnil(state, index))
  return present ? fieldNumber(context, state, tableIndex, field, label) : undefined
}

export function fieldString(context: LuaReadContext, state: LuaState, tableIndex: number, field: string, label: string): string | undefined {
  return withField(context, state, tableIndex, field, (index) => {
    if (context.lua.lua_isnil(state, index)) return undefined
    if (!context.lua.lua_isstring(state, index)) context.fail(state, `${label} must be a string`)
    return context.string(state, index, label)
  })
}

export function fieldBoolean(context: LuaReadContext, state: LuaState, tableIndex: number, field: string, label: string): boolean | undefined {
  return withField(context, state, tableIndex, field, (index) => {
    if (context.lua.lua_isnil(state, index)) return undefined
    if (!context.lua.lua_isboolean(state, index)) context.fail(state, `${label} must be a boolean`)
    return context.lua.lua_toboolean(state, index) !== 0
  })
}

/** A color field given as "#rrggbb[aa]" or {r, g, b[, a]} with 0-1 components; stored as hex. */
export function fieldColor(context: LuaReadContext, state: LuaState, tableIndex: number, field: string, label: string): string | undefined {
  return withField(context, state, tableIndex, field, (index) => {
    if (context.lua.lua_isnil(state, index)) return undefined
    if (context.lua.lua_type(state, index) === context.lua.LUA_TSTRING) {
      const value = context.string(state, index, label)
      if (!HEX_COLOR.test(value)) context.fail(state, `${label} must be a hex color like "#ff8800"`)
      return value
    }
    if (!context.lua.lua_istable(state, index)) context.fail(state, `${label} must be a hex string or {r, g, b, a} table`)
    const components = [1, 2, 3, 4].map((position) => withField(context, state, index, position, (component) => {
      if (context.lua.lua_isnil(state, component)) return position === 4 ? 1 : Number.NaN
      if (!context.lua.lua_isnumber(state, component)) context.fail(state, `${label} components must be numbers`)
      return context.lua.lua_tonumber(state, component) as number
    }))
    if (components.some((value) => !(value >= 0 && value <= 1))) context.fail(state, `${label} components must be between 0 and 1`)
    return `#${components.map((value) => Math.round(value * 255).toString(16).padStart(2, "0")).join("")}`
  })
}

/** Scene-side check for an optional hex color field. */
export function optionalColor(value: unknown, label: string) {
  if (value !== undefined) color(value, label)
}
