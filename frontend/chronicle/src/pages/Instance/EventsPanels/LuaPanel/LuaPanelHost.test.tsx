import { afterEach, describe, expect, it, vi } from "vitest"
import type { RetainedScene } from "../../../Guides/protocol/types"
import { createPanelWorkerHandler } from "../../../Guides/runtime/panelWorker"
import { LuaPanelHost } from "./LuaPanelHost"

// Exercise the host's worker effect without a DOM. State setters capture the retained scene.
const hooks = vi.hoisted(() => ({ effects: [] as Array<() => void | (() => void)>, states: [] as unknown[] }))
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect) },
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => {
    const index = hooks.states.length
    hooks.states.push(typeof initial === "function" ? initial() : initial)
    return [hooks.states[index], (value: unknown) => { hooks.states[index] = value }]
  },
}))

afterEach(() => {
  vi.unstubAllGlobals()
  hooks.effects = []
  hooks.states = []
})

describe("LuaPanelHost startup", () => {
  it("preserves startup batches at ready and resets before the next worker starts", () => {
    const workers: TestWorker[] = []
    class TestWorker {
      onmessage: ((event: { data: unknown }) => void) | null = null
      onerror = null
      messages: unknown[] = []
      terminate = vi.fn()
      handle = createPanelWorkerHandler(data => this.messages.push(data))
      constructor() { workers.push(this) }
      postMessage(message: Parameters<typeof this.handle>[0]) { this.handle(message) }
      deliver() { for (const data of this.messages.splice(0)) this.onmessage?.({ data }) }
    }
    vi.stubGlobal("Worker", TestWorker)
    LuaPanelHost({ entrypoint: "main.lua", sources: { "main.lua": 'CreateFrame("Frame", "startup", UIParent)' }, streams: [], capabilities: ["ui"] })
    const effect = hooks.effects[1]
    const cleanup = effect()
    const scene = () => hooks.states[0] as RetainedScene
    try {
      workers[0].deliver()
      expect(scene().nodes.size).toBe(1)
      expect([...scene().nodes.values()][0].id).toBe("startup")
    } finally { cleanup?.() }

    // Running the same effect again models a worker replacement with existing sceneRef state.
    const cleanupRestart = effect()
    try {
      expect(scene().nodes.size).toBe(0)
      workers[1].deliver()
      expect(scene().nodes.size).toBe(1)
    } finally { cleanupRestart?.() }
  })
})
