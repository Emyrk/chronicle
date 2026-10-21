import { describe, expect, it } from "vitest"
import {
  MAX_MESSAGE_BYTES,
  parseHostMessage,
  parseWorkerMessage,
  ProtocolValidationError,
} from "./protocol"

const viewport = { width: 1280, height: 720 }

describe("guide worker protocol", () => {
  it("accepts every host message kind and clones mutable startup data", () => {
    const source = new Uint8Array([1, 2, 3])
    const start = parseHostMessage({
      type: "start",
      requestId: "start-1",
      guide: {
        id: "onyxia",
        entrypoint: "main.lua",
        capabilities: ["ui", "map", "input", "timers"],
        files: { "main.lua": source },
      },
      viewport,
    })
    source[0] = 9

    expect(start.type).toBe("start")
    if (start.type === "start") expect(start.guide.files["main.lua"]).toEqual(new Uint8Array([1, 2, 3]))
    expect(parseHostMessage({ type: "event", eventId: "event-1", nodeId: "go", event: "click", x: 2, y: 3, button: 0 }).type).toBe("event")
    expect(parseHostMessage({ type: "stop", reason: "route-exit" }).type).toBe("stop")
    expect(parseHostMessage({ type: "resize", viewport }).type).toBe("resize")
    expect(parseHostMessage({ type: "timer", timerId: "timer-1" }).type).toBe("timer")
  })

  it("uses explicit binary limits for startup sources instead of JSON-expanded message size", () => {
    const source = new Uint8Array(128 * 1024)
    expect(() => parseHostMessage({
      type: "start",
      requestId: "large-start",
      guide: { id: "guide", entrypoint: "main.lua", capabilities: [], files: { "main.lua": source } },
      viewport,
    })).not.toThrow()
    expect(() => parseHostMessage({
      type: "start",
      requestId: "too-large-start",
      guide: { id: "guide", entrypoint: "main.lua", capabilities: [], files: { "main.lua": new Uint8Array(1024 * 1024 + 1) } },
      viewport,
    })).toThrow(/1 MiB/)
  })

  it("accepts every worker message kind", () => {
    expect(parseWorkerMessage({ type: "ready", protocolVersion: 1 }).type).toBe("ready")
    expect(parseWorkerMessage({ type: "batch", batchId: "batch-1", operations: [] }).type).toBe("batch")
    expect(parseWorkerMessage({ type: "error", code: "runtime", message: "failed", fatal: true }).type).toBe("error")
    expect(parseWorkerMessage({ type: "ack", eventId: "event-1" }).type).toBe("ack")
  })

  it.each([
    null,
    { type: "wat" },
    { type: "resize", viewport: { width: -1, height: 100 } },
    { type: "event", eventId: "e", nodeId: "n", event: "hover" },
    { type: "timer", timerId: "" },
  ])("rejects malformed host messages", (message) => {
    expect(() => parseHostMessage(message)).toThrow(ProtocolValidationError)
  })

  it("rejects malformed worker messages and oversized messages", () => {
    expect(() => parseWorkerMessage({ type: "ready", protocolVersion: 2 })).toThrow(ProtocolValidationError)
    expect(() => parseWorkerMessage({ type: "ack", eventId: "" })).toThrow(ProtocolValidationError)
    expect(() => parseWorkerMessage({ type: "error", code: "x", message: "x".repeat(MAX_MESSAGE_BYTES), fatal: true })).toThrow(/64 KiB/)
  })

  it("rejects unknown fields rather than silently widening the boundary", () => {
    expect(() => parseHostMessage({ type: "stop", surprise: true })).toThrow(/unknown field/)
    expect(() => parseWorkerMessage({ type: "ready", protocolVersion: 1, surprise: true })).toThrow(/unknown field/)
  })
})
