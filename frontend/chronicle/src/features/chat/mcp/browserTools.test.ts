import { describe, expect, it, vi } from "vitest"
import { InferenceRuntime } from "../runtime"
import { availableBrowserTools, executeBrowserCommand, parseToolCatalog, type BrowserCommand, type BrowserPage, type CatalogTool } from "./browserTools"

const schema = { type: "object", properties: { expected_revision: { type: "integer", minimum: 0 } }, required: ["expected_revision"], additionalProperties: false }
const catalog: CatalogTool[] = [{ name: "save_lua_files", description: "Save browser files to main", input_schema: schema,
  capability_id: "lua-editor", capability_version: 1, effect: "view_mutation", confirmation: "unless_yolo" }]
const capability = { id: "lua-editor", version: 1, scope_type: "lua_project", scope_id: "project" }
const tools = availableBrowserTools(catalog, [capability])
const page: BrowserPage = { url: "http://localhost:4000/modules/author/module/edit", generation: "page-1", sessionId: "session" }
const command: BrowserCommand = { id: "call", type: "tool", toolName: "save_lua_files", generation: page.generation, arguments: { expected_revision: 3 }, capability: tools[0].capability }
const validate = vi.fn(async (_tool, args) => args)
const signal = () => new AbortController().signal

function runtime(confirm = async () => true) {
  const handler = vi.fn(async () => ({ ok: true, saved_to: "main", released: false }))
  const runtime = new InferenceRuntime({ sessionId: page.sessionId, confirm })
  runtime.registerCapability({ id: capability.id, version: capability.version, scope: { type: "lua_project", id: "project" }, tools: { save_lua_files: handler } })
  return { runtime, handler }
}

describe("shared browser tool catalog", () => {
  it("preserves canonical descriptions and schemas and filters by active version", () => {
    expect(tools[0]).toMatchObject({ name: catalog[0].name, description: catalog[0].description, inputSchema: schema, capability: { scopeId: "project" } })
    expect(availableBrowserTools(catalog, [])).toEqual([])
    expect(availableBrowserTools(catalog, [{ ...capability, version: 2 }])).toEqual([])
    expect(parseToolCatalog({ tools: catalog })).toEqual(catalog)
    expect(() => parseToolCatalog({ tools: [...catalog, ...catalog] })).toThrow()
  })

  it("uses the registered handler and requires approval before saving", async () => {
    const confirm = vi.fn(async () => true)
    const { runtime: r, handler } = runtime(confirm)
    const result = await executeBrowserCommand(command, page, tools, r, () => page, signal(), validate)
    expect(result.status).toBe("success")
    expect(confirm).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledOnce()
    expect(validate).toHaveBeenCalledWith(tools[0], command.arguments, expect.any(AbortSignal))
  })

  it("does not allow callers to bypass canonical confirmation", async () => {
    const { runtime: r, handler } = runtime(async () => false)
    const result = await executeBrowserCommand({ ...command, ...{ effect: "read", confirmation: "never" } }, page, tools, r, () => page, signal(), validate)
    expect(result.status).toBe("user_rejected")
    expect(handler).not.toHaveBeenCalled()
  })

  it("rejects navigation away and back to the same URL", async () => {
    const { runtime: r, handler } = runtime()
    const result = await executeBrowserCommand(command, page, tools, r, () => ({ ...page, generation: "page-3" }), signal(), validate)
    expect(result.status).toBe("stale_state")
    expect(handler).not.toHaveBeenCalled()
  })

  it("rejects session, scope and version mismatches", async () => {
    const { runtime: r, handler } = runtime()
    for (const changed of [{ ...command, capability: { ...command.capability, scopeId: "other" } }, { ...command, capability: { ...command.capability, version: 9 } }]) {
      expect((await executeBrowserCommand(changed, page, tools, r, () => page, signal(), validate)).status).toBe("stale_state")
    }
    expect((await executeBrowserCommand(command, page, tools, r, () => ({ ...page, sessionId: "other" }), signal(), validate)).status).toBe("stale_state")
    expect(handler).not.toHaveBeenCalled()
  })

  it("rechecks page generation after server argument validation", async () => {
    const { runtime: r, handler } = runtime()
    let current = page
    const result = await executeBrowserCommand(command, page, tools, r, () => current, signal(), async () => {
      current = { ...page, generation: "new" }
      return command.arguments
    })
    expect(result.status).toBe("stale_state")
    expect(handler).not.toHaveBeenCalled()
  })

  it("cancels a pending approval on navigation without saving", async () => {
    let waiting!: () => void
    const started = new Promise<void>(resolve => { waiting = resolve })
    const { runtime: r, handler } = runtime(() => { waiting(); return new Promise<boolean>(() => {}) })
    const abort = new AbortController()
    const pending = executeBrowserCommand(command, page, tools, r, () => page, abort.signal, validate)
    await started
    abort.abort()
    await expect(pending).rejects.toBeDefined()
    expect(handler).not.toHaveBeenCalled()
  })

  it("advertises only currently available handlers", () => {
    const r = new InferenceRuntime()
    let available = false
    r.registerCapability({ id: "test", version: 1, available: () => available, tools: { inspect: () => ({}) } })
    expect(r.getAvailableTools()).toEqual([])
    available = true
    expect(r.getAvailableTools()[0].names).toEqual(["inspect"])
  })
})
