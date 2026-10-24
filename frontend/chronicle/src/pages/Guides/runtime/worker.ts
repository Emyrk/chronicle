/// <reference lib="webworker" />
import { parseHostMessage, PROTOCOL_VERSION } from "../protocol/protocol"
import type { HostMessage, SceneOperation, WorkerMessage } from "../protocol/types"
import { createGuideRuntime } from "./runtime"

type Runtime = ReturnType<typeof createGuideRuntime>
type PostMessage = (message: WorkerMessage) => void
const decoder = new TextDecoder("utf-8", { fatal: true })

export function createGuideWorkerHandler(postMessage: PostMessage) {
  let runtime: Runtime | null = null
  let batchId = 0
  let generation = 0
  const scheduledTimers = new Map<number, ReturnType<typeof setTimeout>>()

  const clearRuntime = () => {
    generation += 1
    runtime?.stop()
    runtime = null
    for (const timeout of scheduledTimers.values()) clearTimeout(timeout)
    scheduledTimers.clear()
  }
  const postBatch = (operations: SceneOperation[]) => {
    if (operations.length) postMessage({ type: "batch", batchId: String(++batchId), operations })
  }
  const flush = () => { if (runtime) postBatch(runtime.flush()) }
  const postError = (error: unknown, fatal: boolean) => postMessage({
    type: "error", code: fatal ? "runtime_start_failed" : "runtime_callback_failed",
    message: error instanceof Error ? error.message : String(error), fatal,
  })

  return (rawMessage: unknown) => {
    let message: HostMessage
    try { message = parseHostMessage(rawMessage) } catch (error) { postError(error, true); return }
    try {
      if (message.type === "start") {
        clearRuntime(); batchId = 0
        const sources: Record<string, string> = {}
        for (const [path, bytes] of Object.entries(message.guide.files)) if (path.endsWith(".lua")) sources[path] = decoder.decode(bytes)
        runtime = createGuideRuntime({
          entrypoint: message.guide.entrypoint,
          sources,
          capabilities: message.guide.capabilities,
          emitBatch: postBatch,
          scheduleTimer: (id, delayMs) => {
            const scheduledGeneration = generation
            const timeout = setTimeout(() => {
              scheduledTimers.delete(id)
              if (!runtime || scheduledGeneration !== generation) return
              try { runtime.timer(id); flush() } catch (error) { postError(error, false) }
            }, delayMs)
            scheduledTimers.set(id, timeout)
          },
        })
        runtime.start()
        postMessage({ type: "ready", protocolVersion: PROTOCOL_VERSION })
        return
      }
      if (message.type === "stop") { clearRuntime(); return }
      if (!runtime) throw new Error("guide runtime has not started")
      if (message.type === "event") {
        const args = [message.x, message.y, message.button].filter((value) => value !== undefined)
        runtime.event({ id: message.nodeId, event: message.event, args }); flush()
        postMessage({ type: "ack", eventId: message.eventId })
      } else if (message.type === "resize") {
        runtime.resize(message.viewport.width, message.viewport.height); flush()
      } else {
        const id = Number(message.timerId)
        if (!Number.isSafeInteger(id) || id < 1) throw new Error(`invalid timer '${message.timerId}'`)
        const timeout = scheduledTimers.get(id); if (timeout) clearTimeout(timeout); scheduledTimers.delete(id)
        runtime.timer(id); flush()
      }
    } catch (error) { postError(error, message.type === "start") }
  }
}

const workerScope = typeof self === "undefined" ? null : self as DedicatedWorkerGlobalScope
if (workerScope) {
  const handleMessage = createGuideWorkerHandler((message) => workerScope.postMessage(message))
  workerScope.onmessage = (event: MessageEvent<unknown>) => handleMessage(event.data)
}
