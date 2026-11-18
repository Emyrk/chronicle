import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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
vi.mock("../runtime", () => ({ useInferenceRuntime: () => ({ sessionId: "test-session" }) }))
vi.mock("./browserTools", () => ({ loadToolCatalog: async () => [], availableBrowserTools: () => [] }))
vi.mock("./localBridge", () => ({ connectLocalMcp: vi.fn() }))

let browser: EventTarget & { location: { origin: string }; confirm: ReturnType<typeof vi.fn> }
function render() {
  hooks.refIndex = 0
  hooks.stateIndex = 0
  hooks.effectIndex = 0
  const element = LocalMcpProvider({ children: null })
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
