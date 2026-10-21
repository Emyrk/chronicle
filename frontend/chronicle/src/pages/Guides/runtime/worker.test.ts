import { afterEach, describe, expect, it, vi } from "vitest"
import { parseWorkerMessage } from "../protocol/protocol"
import type { GuideCapability, WorkerMessage } from "../protocol/types"
import { createGuideWorkerHandler } from "./worker"

const encoder = new TextEncoder()
function start(source: string, capabilities: readonly GuideCapability[] = ["ui", "input", "timers"]) {
  return {
    type: "start" as const, requestId: "start-1",
    guide: { id: "test", entrypoint: "main.lua", capabilities, files: { "main.lua": encoder.encode(source) } },
    viewport: { width: 800, height: 600 },
  }
}

afterEach(() => vi.useRealTimers())

describe("guide worker handler", () => {
  it("decodes Uint8Array files and posts protocol-valid ready and batches", () => {
    const messages: WorkerMessage[] = []
    const handle = createGuideWorkerHandler((message) => messages.push(message))
    handle(start(`local b=CreateFrame("Button","go",UIParent); b:SetText("Go")`))
    expect(messages.map((message) => message.type)).toEqual(["batch", "ready"])
    for (const message of messages) expect(() => parseWorkerMessage(message)).not.toThrow()
  })

  it("handles click, resize, timers, acknowledgements, and stop cleanup", () => {
    vi.useFakeTimers()
    const messages: WorkerMessage[] = []
    const handle = createGuideWorkerHandler((message) => messages.push(message))
    handle(start(`
      local b=CreateFrame("Button","go",UIParent)
      b:SetScript("OnClick",function() b:SetText("clicked") end)
      UIParent:SetScript("OnSizeChanged",function(_,w,h) b:SetSize(w,h) end)
      C_Timer.After(0.01,function() b:Hide() end)
    `))
    handle({ type: "event", eventId: "event-1", nodeId: "go", event: "click", button: 0 })
    handle({ type: "resize", viewport: { width: 640, height: 480 } })
    vi.advanceTimersByTime(11)
    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "ack", eventId: "event-1" }),
      expect.objectContaining({ type: "batch" }),
    ]))
    handle({ type: "stop", reason: "test" })
  })

  it("enforces the capabilities transported by the start message", () => {
    const messages: WorkerMessage[] = []
    const handle = createGuideWorkerHandler((message) => messages.push(message))
    handle(start(`assert(Map == nil and C_Timer == nil); CreateFrame("Frame", "ok", UIParent)`, ["ui"]))
    expect(messages.some((item) => item.type === "error")).toBe(false)

    const denied: WorkerMessage[] = []
    const deniedHandle = createGuideWorkerHandler((item) => denied.push(item))
    deniedHandle(start(`CreateFrame("Frame", "nope", UIParent)`, []))
    expect(denied).toContainEqual(expect.objectContaining({ type: "error", fatal: true }))
  })

  it("fails closed on invalid messages and runtime errors", () => {
    const messages: WorkerMessage[] = []
    const handle = createGuideWorkerHandler((message) => messages.push(message))
    handle({ type: "start", requestId: "bad" })
    handle(start(`error("boom")`))
    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "error", fatal: true }),
      expect.objectContaining({ type: "error", message: expect.stringMatching(/main\.lua:1.*boom/) }),
    ]))
  })
})
