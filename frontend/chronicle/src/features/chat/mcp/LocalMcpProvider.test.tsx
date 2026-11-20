import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactElement, ReactNode } from "react"
import { createMemoryRouter } from "react-router-dom"
import { LocalMcpProvider } from "./LocalMcpProvider"
import { connectLocalMcp } from "./localBridge"

// Node-only harness: execute provider effects explicitly, but let the real data
// router own PUSH/REPLACE/POP and blocker proceed/reset. This does not test React
// scheduling, RouterProvider wiring, browser history, or native dialog rendering.
type Effect = { run: () => void | (() => void); deps: readonly unknown[]; cleanup?: () => void }
const hooks = vi.hoisted(() => ({
  states: [] as unknown[], stateIndex: 0,
  refs: [] as Array<{ current: unknown }>, refIndex: 0,
  effects: [] as Effect[], effectIndex: 0, pending: [] as Array<() => void>,
  pendingConfirmation: null as null | { runId: string; toolName: string; arguments: object },
  capabilities: [] as Array<{ id: string; version: number; scope_id: string }>,
  router: null as ReturnType<typeof createMemoryRouter> | null,
}))
vi.mock("react", async importOriginal => {
  const effect = (run: Effect["run"], deps: readonly unknown[]) => {
    const index = hooks.effectIndex++
    const previous = hooks.effects[index]
    if (previous && deps.length === previous.deps.length && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return
    hooks.pending.push(() => {
      previous?.cleanup?.()
      const effect: Effect = { run, deps }
      effect.cleanup = run() || undefined
      hooks.effects[index] = effect
    })
  }
  return {
  ...await importOriginal<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.stateIndex++
    if (!(index in hooks.states)) hooks.states[index] = initial
    return [hooks.states[index], (value: unknown) => { hooks.states[index] = value }]
  },
  useRef: (current: unknown) => {
    const index = hooks.refIndex++
    return hooks.refs[index] ??= { current }
  },
  useMemo: (fn: () => unknown) => fn(),
  useCallback: (fn: unknown) => fn,
  useEffectEvent: (fn: unknown) => fn,
  useLayoutEffect: effect,
  useEffect: effect,
  }
})
vi.mock("react-router-dom", async importOriginal => ({
  ...await importOriginal<typeof import("react-router-dom")>(),
  useLocation: () => hooks.router!.state.location,
  useBlocker: (active: boolean) => hooks.router!.getBlocker("local-mcp", () => active),
}))
vi.mock("../runtime", () => {
  const registerCapability = vi.fn(() => () => {})
  return { useInferenceRuntime: () => ({ sessionId: "test-session", registerCapability, capabilities: hooks.capabilities, pendingConfirmation: hooks.pendingConfirmation }) }
})
vi.mock("./browserTools", () => ({ loadToolCatalog: async () => [], availableBrowserTools: () => [] }))
vi.mock("./localBridge", () => ({ connectLocalMcp: vi.fn() }))

let browser: EventTarget & { location: { origin: string }; confirm: ReturnType<typeof vi.fn> }
let tree: ReactNode
function render() {
  hooks.refIndex = 0
  hooks.stateIndex = 0
  hooks.effectIndex = 0
  const element = LocalMcpProvider({ children: null })
  tree = element
  for (const effect of hooks.pending.splice(0)) effect()
  return element.props.value
}
function unload() {
  const event = new Event("beforeunload", { cancelable: true })
  // Node's Event has a boolean legacy returnValue, unlike BeforeUnloadEvent.
  Object.defineProperty(event, "returnValue", { value: "unchanged", writable: true })
  browser.dispatchEvent(event)
  return event
}

beforeEach(() => {
  hooks.router = createMemoryRouter([{ path: "*", element: null }], { initialEntries: ["/previous", "/current"] })
  browser = Object.assign(new EventTarget(), { location: { origin: "https://chronicle.test" }, confirm: vi.fn() })
  vi.stubGlobal("window", browser)
})
afterEach(() => {
  for (const effect of hooks.effects) effect.cleanup?.()
  hooks.router?.dispose()
  hooks.router = null
  hooks.pendingConfirmation = null
  hooks.capabilities = []
  hooks.refs = []
  hooks.states = []
  hooks.effects = []
  hooks.pending = []
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const navigations = [
  { name: "PUSH", navigate: () => hooks.router!.navigate("/next"), destination: "/next" },
  { name: "REPLACE", navigate: () => hooks.router!.navigate("/next", { replace: true }), destination: "/next" },
  { name: "POP", navigate: () => hooks.router!.navigate(-1), destination: "/previous" },
]

describe("Local MCP navigation protection", () => {
  it.each(navigations)("does not prompt for inactive $name navigation", async ({ navigate, destination }) => {
    render()
    await navigate()
    render()
    expect(hooks.router!.state.location.pathname).toBe(destination)
    expect(browser.confirm).not.toHaveBeenCalled()
    expect(unload().defaultPrevented).toBe(false)
  })

  for (const approved of [false, true]) {
    it.each(navigations)(`${approved ? "confirms" : "cancels"} active $name navigation`, async ({ navigate, destination }) => {
      render().connect()
      render()
      browser.confirm.mockReturnValue(approved)
      const original = hooks.router!.state.location
      await navigate()
      expect(hooks.router!.state.location).toBe(original)
      expect(hooks.router!.state.blockers.get("local-mcp")?.state).toBe("blocked")
      render()
      expect(browser.confirm).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("Pending MCP calls will be canceled"))
      // POP continuation waits for the history reversal before replaying the move.
      await vi.waitFor(() => expect(hooks.router!.state.location.pathname).toBe(approved ? destination : "/current"))
      if (!approved) expect(hooks.router!.state.location).toBe(original)
      expect(render().active).toBe(true)
      expect(browser.confirm).toHaveBeenCalledTimes(1)
    })
  }

  it("gives a repeated history visit fresh tool authority without changing it on rerender", async () => {
    render().connect()
    render()
    await vi.waitFor(() => expect(connectLocalMcp).toHaveBeenCalledTimes(1))
    const connection = vi.mocked(connectLocalMcp).mock.calls[0][0]
    const first = connection.current().page
    const originalKey = hooks.router!.state.location.key
    render()
    expect(connection.current().page.generation).toBe(first.generation)

    browser.confirm.mockReturnValue(true)
    await hooks.router!.navigate("/next")
    render() // Approve the blocked navigation.
    render() // Commit the new location.
    const second = connection.current().page
    expect(second.url).not.toBe(first.url)
    expect(second.generation).not.toBe(first.generation)

    await hooks.router!.navigate(-1)
    render()
    await vi.waitFor(() => expect(hooks.router!.state.location.key).toBe(originalKey))
    render()
    const returned = connection.current().page
    expect(returned.url).toBe(first.url)
    expect(returned.generation).not.toBe(first.generation)
    expect(returned.generation).not.toBe(second.generation)
    render()
    expect(connection.current().page.generation).toBe(returned.generation)
  })

  it("removes beforeunload protection on disconnect and unmount", async () => {
    render().connect()
    let context = render()
    const event = unload()
    expect(event.defaultPrevented).toBe(true)
    expect(event.returnValue).toBe("")
    context.disconnect()
    context = render()
    expect(unload().defaultPrevented).toBe(false)
    await hooks.router!.navigate("/next")
    render()
    expect(browser.confirm).not.toHaveBeenCalled()
    context.connect()
    render()
    expect(unload().defaultPrevented).toBe(true)
    for (const effect of hooks.effects) effect.cleanup?.()
    hooks.effects = []
    expect(unload().defaultPrevented).toBe(false)
  })
})

// Inspect rendered host elements without pretending this harness tests a DOM.
type Host = ReactElement<{ children?: ReactNode; [key: string]: unknown }>
function nodes(node: ReactNode = tree): Host[] {
  if (Array.isArray(node)) return node.flatMap(child => nodes(child))
  if (!node || typeof node !== "object" || !("props" in node)) return []
  const element = node as Host
  return [element, ...nodes(element.props.children ?? null)]
}
function text(node: ReactNode = tree): string {
  if (Array.isArray(node)) return node.map(child => text(child)).join("")
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (node && typeof node === "object" && "props" in node) return text((node as Host).props.children ?? null)
  return ""
}
function click(label: string) {
  const button = nodes().find(node => node.type === "button" && text(node) === label)
  expect(button, label).toBeDefined()
  ;(button!.props.onClick as () => void)()
}
async function start() {
  render().connect()
  render()
  await vi.waitFor(() => expect(connectLocalMcp).toHaveBeenCalledTimes(1))
  return vi.mocked(connectLocalMcp).mock.calls[0][0]
}
const metadata = {
  id: "connection-123", name: "Module example", page: { url: "https://chronicle.test/current", generation: "1", sessionId: "test-session" },
  owner: { id: "agent-1", name: "<script>agent</script>", version: "3.0" }, ownershipRevision: 1,
}

describe("Local MCP connection controls", () => {
  it("shows live status and owner metadata as text, and copies the connection ID", async () => {
    const copy = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("navigator", { clipboard: { writeText: copy } })
    const bridge = await start()
    expect(text()).toContain("Connecting to local MCP")
    bridge.connected?.()
    bridge.changed?.(metadata)
    render()
    expect(text()).toContain("Local MCP connected")
    expect(text()).toContain("<script>agent</script>")
    expect(text()).toContain("Version: 3.0")
    expect(text()).toContain("agent-1")
    expect(nodes().some(node => "dangerouslySetInnerHTML" in node.props)).toBe(false)
    click("Copy connection ID")
    expect(copy).toHaveBeenCalledWith("connection-123")
    bridge.status?.("reconnecting")
    render()
    expect(text()).toContain("Reconnecting to local MCP")
    bridge.status?.("connected")
    bridge.changed?.({ ...metadata, owner: null, ownershipRevision: 2 })
    render()
    expect(text()).toContain("No agent owns this connection")
    expect(text()).not.toContain("agent-1")
  })

  it("uses the module scope as a default and only renames explicitly, without reconnecting", async () => {
    hooks.capabilities = [{ id: "lua-editor", version: 1, scope_id: "my-module" }]
    const bridge = await start()
    expect(bridge.current().name).toBe("Module my-module")
    const input = nodes().find(node => node.type === "input")!
    ;(input.props.onChange as (event: unknown) => void)({ target: { value: "Raid workspace" } })
    render()
    expect(bridge.current().name).toBe("Module my-module")
    const form = nodes().find(node => node.type === "form")!
    ;(form.props.onSubmit as (event: unknown) => void)({ preventDefault: vi.fn() })
    render()
    expect(bridge.current().name).toBe("Raid workspace")
    expect(connectLocalMcp).toHaveBeenCalledTimes(1)
  })

  it("bounds default names and explicit rename by Unicode code points", async () => {
    hooks.capabilities = [{ id: "lua-editor", version: 1, scope_id: "🎉".repeat(100) }]
    const bridge = await start()
    const original = bridge.current().name
    expect([...original]).toHaveLength(80)
    for (const value of [" ", "x".repeat(81), "🎉".repeat(80)]) {
      const input = nodes().find(node => node.type === "input")!
      ;(input.props.onChange as (event: unknown) => void)({ target: { value } })
      render()
      const form = nodes().find(node => node.type === "form")!
      ;(form.props.onSubmit as (event: unknown) => void)({ preventDefault: vi.fn() })
      render()
      expect(bridge.current().name).toBe(value.startsWith("🎉") ? value : original)
    }
    expect(connectLocalMcp).toHaveBeenCalledTimes(1)
  })

  it.each(["work", "approval"])("confirms revoke and disconnect with pending %s", async pending => {
    const bridge = await start()
    const revoke = vi.fn().mockResolvedValue(undefined)
    bridge.controls?.({ revoke })
    bridge.changed?.(metadata)
    if (pending === "work") bridge.busy?.(true)
    else hooks.pendingConfirmation = { runId: "local-mcp:1", toolName: "save_lua_files", arguments: {} }
    render()
    browser.confirm.mockReturnValue(false)
    click("Revoke agent access")
    render().disconnect()
    expect(revoke).not.toHaveBeenCalled()
    expect(bridge.signal.aborted).toBe(false)
    browser.confirm.mockReturnValue(true)
    click("Revoke agent access")
    expect(revoke).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    render().disconnect()
    expect(bridge.signal.aborted).toBe(true)
    expect(render().active).toBe(false)
  })

  it("surfaces revoke failures without discarding the connection", async () => {
    const bridge = await start()
    bridge.changed?.(metadata)
    bridge.controls?.({ revoke: async () => { throw new Error("Revoke failed. Disconnect and retry.") } })
    render()
    click("Revoke agent access")
    await Promise.resolve()
    expect(render().active).toBe(true)
    expect(text()).toContain("Revoke failed. Disconnect and retry.")
    expect(bridge.signal.aborted).toBe(false)
  })

  it("uses the page path without query parameters and ignores callbacks after disconnect", async () => {
    await hooks.router!.navigate("/current?private=value")
    const bridge = await start()
    expect(bridge.current().name).toBe("Chronicle /current")
    render().disconnect()
    bridge.changed?.(metadata)
    bridge.status?.("reconnecting")
    bridge.busy?.(true)
    expect(render().active).toBe(false)
    expect(text()).not.toContain("connection-123")
    expect(browser.confirm).not.toHaveBeenCalled()
  })

  it("does not connect in safe mode", async () => {
    await hooks.router!.navigate("/current?safe=1")
    render().connect()
    expect(render().active).toBe(false)
    await Promise.resolve()
    expect(connectLocalMcp).not.toHaveBeenCalled()
  })

  it("reports connection failures", async () => {
    vi.mocked(connectLocalMcp).mockRejectedValueOnce(new Error("Protocol mismatch"))
    await start()
    render()
    expect(text()).toContain("Local MCP error")
    expect(text()).toContain("Protocol mismatch")
  })
})
