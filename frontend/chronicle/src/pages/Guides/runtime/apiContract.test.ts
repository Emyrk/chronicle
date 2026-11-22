import { describe, expect, it } from "vitest"
import { createGuideRuntime } from "./runtime"
import definitions from "../../LuaProjects/lua-panel-api.d.lua?raw"

/**
 * Every function a panel module can call must be in lua-panel-api.d.lua, which the published
 * Module API reference (/modules/api, and the assistants' lua-module-api skill) is generated from.
 * Adding or removing a Lua API without updating the definitions fails here.
 */

/** Methods every object carries for the guide map profile; panel objects never use them. */
const MAP_ONLY_METHODS = ["SetAngle", "SetCreatureID", "SetFacing", "SetFillColor", "SetHeadSize", "SetLabel", "SetLineWidth",
  "SetMapPosition", "SetPoints", "SetPosition", "SetRadius", "SetRole"]

/** The panel runtime's API, listed from inside Lua. */
function panelApi(): string[] {
  const runtime = createGuideRuntime({ entrypoint: "main.lua", capabilities: ["ui", "input"], panelStreams: ["damage"], sources: { "main.lua": `
    local names = {}
    local function list(prefix, t) for k, v in pairs(t) do if type(v) == "function" then names[#names + 1] = prefix .. k end end end
    list("method:", CreateFrame("Frame", "probe"))
    list("Chronicle.", Chronicle)
    list("Panel:", Panel)
    CreateFrame("FontString", "names"):SetText(table.concat(names, ","))
  ` } })
  try {
    const set = runtime.start().find((op) => op.op === "set" && op.id === "names") as { props: { text: string } } | undefined
    return set!.props.text.split(",")
  } finally { runtime.stop() }
}

/** Functions declared in the definitions, in the same notation. */
function documentedApi(): string[] {
  const names = new Set<string>()
  for (const [, owner, separator, name] of definitions.matchAll(/^function (\w+)([:.])(\w+)\(/gm)) {
    if (owner === "Chronicle" || owner === "Panel") names.add(`${owner}${separator}${name}`)
    else if (owner.startsWith("Chronicle") && separator === ":") names.add(`method:${name}`)
  }
  return [...names]
}

describe("Lua API definitions", () => {
  it("document every function a panel module can call, and nothing else", () => {
    const actual = panelApi().filter((name) => !MAP_ONLY_METHODS.includes(name.replace(/^method:/, "")))
    const documented = documentedApi()
    expect(actual.filter((name) => !documented.includes(name)).sort(), "Undocumented: add these to lua-panel-api.d.lua and lua-panel-api.md, then run pnpm generate:lua-api").toEqual([])
    expect(documented.filter((name) => !actual.includes(name)).sort(), "Documented but missing from the runtime").toEqual([])
  })
})
