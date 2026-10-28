import { MAX_OPERATIONS, MAX_STRING_LENGTH, validateSceneOperation } from "./scene"
import type { GuideCapability, HostMessage, Viewport, WorkerMessage } from "./types"

export const PROTOCOL_VERSION = 1 as const
export const MAX_MESSAGE_BYTES = 64 * 1024
const CAPABILITIES = new Set(["ui", "map", "input", "timers"])
const MAX_START_FILES = 512
const MAX_START_SOURCE_BYTES = 1024 * 1024
const encoder = new TextEncoder()

export class ProtocolValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ProtocolValidationError"
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ProtocolValidationError(`${label} must be an object`)
  return value as Record<string, unknown>
}

function exact(value: Record<string, unknown>, fields: readonly string[], label: string) {
  for (const key of Object.keys(value)) if (!fields.includes(key)) throw new ProtocolValidationError(`${label} has unknown field ${key}`)
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

function string(value: unknown, label: string, max = MAX_STRING_LENGTH): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max || hasControlCharacters(value)) {
    throw new ProtocolValidationError(`${label} must be a non-empty safe string of at most ${max} characters`)
  }
  return value
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new ProtocolValidationError(`${label} must be a finite number`)
  return value
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new ProtocolValidationError(`${label} must be a boolean`)
  return value
}

function viewport(value: unknown): Viewport {
  const input = object(value, "viewport")
  exact(input, ["width", "height"], "viewport")
  const width = finite(input.width, "viewport.width")
  const height = finite(input.height, "viewport.height")
  if (width <= 0 || height <= 0 || width > 16_384 || height > 16_384) throw new ProtocolValidationError("viewport dimensions must be between 0 and 16384")
  return { width, height }
}

function messageSize(value: unknown): number {
  try {
    return encoder.encode(JSON.stringify(value)).byteLength
  } catch {
    throw new ProtocolValidationError("message must be serializable")
  }
}

function assertMessageSize(value: unknown) {
  if (messageSize(value) > MAX_MESSAGE_BYTES) throw new ProtocolValidationError("message exceeds the 64 KiB limit")
}

/**
 * Splits UI operations into chunks whose batch messages each fit MAX_MESSAGE_BYTES, so large
 * redraws are delivered in several messages instead of failing. Order is preserved.
 */
export function splitBatchOperations<T>(operations: readonly T[]): T[][] {
  const budget = MAX_MESSAGE_BYTES - 256 // Room for the batch envelope.
  const chunks: T[][] = []
  let chunk: T[] = []
  let bytes = 0
  for (const operation of operations) {
    const size = messageSize(operation) + 1
    if (chunk.length && bytes + size > budget) { chunks.push(chunk); chunk = []; bytes = 0 }
    chunk.push(operation); bytes += size
  }
  if (chunk.length) chunks.push(chunk)
  return chunks
}

function luaSourcePath(value: unknown): string {
  const path = string(value, "file path")
  if (path.startsWith("/") || path.includes("\\") || path.includes("\0")
    || path.split("/").some((segment) => !segment || segment === "." || segment === "..")
    || !path.toLowerCase().endsWith(".lua")) {
    throw new ProtocolValidationError("guide.files paths must be normalized package-local .lua files")
  }
  return path
}

function cloneFiles(value: unknown): Readonly<Record<string, Uint8Array>> {
  const files = object(value, "guide.files")
  const entries = Object.entries(files)
  if (entries.length > MAX_START_FILES) throw new ProtocolValidationError(`guide.files exceeds ${MAX_START_FILES} files`)
  const result: Record<string, Uint8Array> = {}
  let totalBytes = 0
  for (const [rawPath, bytes] of entries) {
    const path = luaSourcePath(rawPath)
    if (!(bytes instanceof Uint8Array)) throw new ProtocolValidationError(`guide.files[${path}] must be a Uint8Array`)
    totalBytes += bytes.byteLength
    if (totalBytes > MAX_START_SOURCE_BYTES) throw new ProtocolValidationError("guide Lua sources exceed the 1 MiB worker limit")
    result[path] = bytes.slice()
  }
  return Object.freeze(result)
}

export function parseHostMessage(value: unknown): HostMessage {
  const message = object(value, "host message")
  if (message.type !== "start") assertMessageSize(value)
  switch (message.type) {
    case "start": {
      exact(message, ["type", "requestId", "guide", "viewport"], "start message")
      const guide = object(message.guide, "guide")
      exact(guide, ["id", "entrypoint", "capabilities", "files"], "guide")
      if (!Array.isArray(guide.capabilities) || guide.capabilities.some((capability) => typeof capability !== "string" || !CAPABILITIES.has(capability))) {
        throw new ProtocolValidationError("guide.capabilities contains an unsupported capability")
      }
      if (new Set(guide.capabilities).size !== guide.capabilities.length) throw new ProtocolValidationError("guide.capabilities contains duplicates")
      const capabilities = Object.freeze([...guide.capabilities]) as readonly GuideCapability[]
      const entrypoint = luaSourcePath(guide.entrypoint)
      const files = cloneFiles(guide.files)
      if (!(entrypoint in files)) throw new ProtocolValidationError("guide.entrypoint must exist in guide.files")
      return {
        type: "start",
        requestId: string(message.requestId, "requestId", 128),
        guide: {
          id: string(guide.id, "guide.id", 128),
          entrypoint,
          capabilities,
          files,
        },
        viewport: viewport(message.viewport),
      }
    }
    // Start messages carry binary Lua sources and use explicit file/byte limits
    // instead of JSON serialization, which expands Uint8Array indices.
    case "event": {
      exact(message, ["type", "eventId", "nodeId", "event", "x", "y", "button"], "event message")
      if (message.event !== "click") throw new ProtocolValidationError("event.event is invalid")
      const result: Extract<HostMessage, { type: "event" }> = {
        type: "event",
        eventId: string(message.eventId, "eventId", 128),
        nodeId: string(message.nodeId, "nodeId", 128),
        event: "click",
      }
      if (message.x !== undefined) result.x = finite(message.x, "event.x")
      if (message.y !== undefined) result.y = finite(message.y, "event.y")
      if (message.button !== undefined) {
        const button = finite(message.button, "event.button")
        if (!Number.isInteger(button) || button < 0 || button > 4) throw new ProtocolValidationError("event.button is invalid")
        result.button = button
      }
      return result
    }
    case "stop":
      exact(message, ["type", "reason"], "stop message")
      return message.reason === undefined ? { type: "stop" } : { type: "stop", reason: string(message.reason, "stop.reason") }
    case "resize":
      exact(message, ["type", "viewport"], "resize message")
      return { type: "resize", viewport: viewport(message.viewport) }
    case "timer":
      exact(message, ["type", "timerId"], "timer message")
      return { type: "timer", timerId: string(message.timerId, "timerId", 128) }
    default:
      throw new ProtocolValidationError("unknown host message type")
  }
}

export function parseWorkerMessage(value: unknown): WorkerMessage {
  assertMessageSize(value)
  const message = object(value, "worker message")
  switch (message.type) {
    case "ready":
      exact(message, ["type", "protocolVersion"], "ready message")
      if (message.protocolVersion !== PROTOCOL_VERSION) throw new ProtocolValidationError("unsupported protocol version")
      return { type: "ready", protocolVersion: PROTOCOL_VERSION }
    case "batch": {
      exact(message, ["type", "batchId", "operations"], "batch message")
      if (!Array.isArray(message.operations)) throw new ProtocolValidationError("batch.operations must be an array")
      if (message.operations.length > MAX_OPERATIONS) throw new ProtocolValidationError(`batch exceeds ${MAX_OPERATIONS} operations`)
      try {
        return { type: "batch", batchId: string(message.batchId, "batchId", 128), operations: Object.freeze(message.operations.map(validateSceneOperation)) }
      } catch (error) {
        throw new ProtocolValidationError(error instanceof Error ? error.message : "invalid batch operation")
      }
    }
    case "error":
      exact(message, ["type", "code", "message", "fatal"], "error message")
      return { type: "error", code: string(message.code, "error.code", 128), message: string(message.message, "error.message"), fatal: boolean(message.fatal, "error.fatal") }
    case "ack":
      exact(message, ["type", "eventId"], "ack message")
      return { type: "ack", eventId: string(message.eventId, "eventId", 128) }
    default:
      throw new ProtocolValidationError("unknown worker message type")
  }
}
