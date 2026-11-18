import { afterEach, describe, expect, it, vi } from "vitest"
import { InferenceRuntime, type InferenceCapabilityDescriptor } from "../runtime"
import { executeBrowserCommand, type BrowserPage, type BrowserTool } from "./browserTools"
import { guidanceCapability, pageGuidanceRegistration } from "./pageGuidance"

const page: BrowserPage = { url: "http://localhost:5173/modules/a/b/edit", generation: "visit-1", sessionId: "session-1" }
const descriptor = (id: string): InferenceCapabilityDescriptor => ({ id, version: 1 })
const context = (signal = new AbortController().signal) => ({ signal, runId: "local-mcp:test", threadId: "local-mcp", toolCallId: "test", context: undefined })
function setup(capabilities = ["lua-editor"]) {
  const runtime = new InferenceRuntime({ sessionId: page.sessionId })
  for (const id of capabilities) runtime.registerCapability({ id, version: 1, tools: { [`${id}_tool`]: () => ({}) } })
  const registration = pageGuidanceRegistration(page, () => runtime)
  runtime.registerCapability(registration)
  return { runtime, registration }
}
afterEach(() => { vi.unstubAllGlobals() })

describe("page guidance", () => {
  it("chooses the specialized page assistant and defaults to site help", () => {
    expect(guidanceCapability([descriptor("search-page"), descriptor("lua-editor")])).toBe("lua-editor")
    expect(guidanceCapability([descriptor("instance-page")])).toBe("instance-page")
    expect(guidanceCapability([descriptor("search-page")])).toBe("search-page")
    expect(guidanceCapability([descriptor("page-guidance")])).toBeUndefined()
  })

  it("fetches the UI prompt without rewriting it and attaches only public page/tool context", async () => {
    const body = { assistant_id: "addon-workshop-panel", assistant_name: "Module Workshop", prompt: "Canonical UI prompt\nVerbatim.", skills: [{ id: "lua-module-api", name: "Lua API", version: "1" }], instructions: "Call list_skill and read_skill." }
    const fetcher = vi.fn(async () => Response.json(body))
    vi.stubGlobal("fetch", fetcher)
    const { registration } = setup()
    const ctx = context()
    expect(await registration.tools.gen_page_context({}, ctx)).toEqual({ ...body, page, capabilities: [descriptor("lua-editor")], available_tools: ["lua-editor_tool"] })
    expect(fetcher).toHaveBeenCalledWith("/api/v1/inference/client-tools/context?capability_id=lua-editor", { credentials: "same-origin", cache: "no-store", signal: ctx.signal })
    expect(registration.scope).toEqual({ type: "page", id: page.generation })
  })

  it("lists and reads canonical skills using live page capabilities, without local content copies", async () => {
    const fetcher = vi.fn(async () => Response.json({ instructions: "Canonical skill" }))
    vi.stubGlobal("fetch", fetcher)
    const { runtime, registration } = setup([])
    await registration.tools.list_skill({}, context())
    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/v1/inference/client-tools/skills", expect.anything())
    const unregister = runtime.registerCapability({ id: "search-page", version: 1, tools: {} })
    await registration.tools.read_skill({ skill_id: "instance-search" }, context())
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/v1/inference/client-tools/skills/instance-search?capability_id=search-page", expect.anything())
    unregister()
  })

  it("ignores unavailable page capabilities", async () => {
    const { runtime, registration } = setup([])
    runtime.registerCapability({ id: "lua-editor", version: 1, available: false, tools: {} })
    const fetcher = vi.fn(async () => Response.json({ skills: [] }))
    vi.stubGlobal("fetch", fetcher)
    await registration.tools.list_skill({}, context())
    expect(fetcher).toHaveBeenCalledWith("/api/v1/inference/client-tools/skills", expect.anything())
  })

  it.each([null, {}, { skill_id: "../secret" }, { skill_id: "" }, { skill_id: "a".repeat(101) }])("rejects invalid skill identifiers before fetching (%j)", async args => {
    const fetcher = vi.fn()
    vi.stubGlobal("fetch", fetcher)
    const { registration } = setup()
    await expect(async () => registration.tools.read_skill(args, context())).rejects.toThrow("Invalid skill ID")
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("reports endpoint errors without returning a substitute prompt", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("private server details", { status: 403 })))
    const { registration } = setup()
    await expect(registration.tools.gen_page_context({}, context())).rejects.toThrow("Chronicle page guidance unavailable (403)")
  })

  it("discards a prompt fetched for a page that navigated while the request was pending", async () => {
    let resolve!: (response: Response) => void
    const fetcher = vi.fn(() => new Promise<Response>(done => { resolve = done }))
    vi.stubGlobal("fetch", fetcher)
    const { runtime } = setup()
    const tool: BrowserTool = { name: "gen_page_context", description: "Page guidance", inputSchema: {}, effect: "read", confirmation: "never", capability: { id: "page-guidance", version: 1, scopeType: "page", scopeId: page.generation } }
    let current = page
    const call = executeBrowserCommand({ id: "call", type: "tool", generation: page.generation, toolName: tool.name, arguments: {}, capability: tool.capability }, page, [tool], runtime, () => current, context().signal, async () => ({}))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    current = { ...page, generation: "visit-2" }
    resolve(Response.json({ prompt: "Old page prompt" }))
    expect(await call).toMatchObject({ status: "stale_state" })
  })
})
