import { afterEach, describe, expect, it, vi } from "vitest"
import { GuideRuntimeController, type WorkerLike } from "./controller"

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  messages: unknown[] = []
  terminated = false
  postMessage(message: unknown) { this.messages.push(message) }
  terminate() { this.terminated = true }
  emit(data: unknown) { this.onmessage?.({ data } as MessageEvent<unknown>) }
}
const startMessage = () => ({
  type: "start" as const, requestId: "start-1",
  guide: { id: "test", entrypoint: "main.lua", capabilities: ["ui"] as const, files: { "main.lua": new TextEncoder().encode("return true") } },
  viewport: { width: 800, height: 600 },
})

afterEach(() => vi.useRealTimers())

describe("GuideRuntimeController", () => {
  it("uses a dedicated module worker and forwards validated lifecycle messages", () => {
    const workers: FakeWorker[] = []
    const factory = vi.fn((_url: URL, options: WorkerOptions) => { expect(options.type).toBe("module"); const worker = new FakeWorker(); workers.push(worker); return worker })
    const controller = new GuideRuntimeController({ workerFactory: factory, watchdogMs: 1_000 })
    controller.start(startMessage()); workers[0].emit({ type: "ready", protocolVersion: 1 })
    controller.event({ eventId: "event-1", nodeId: "button", event: "click", x: 10, y: 20, button: 0 })
    workers[0].emit({ type: "ack", eventId: "event-1" })
    controller.resize(640, 480); controller.timer("7")
    expect(workers[0].messages).toEqual([
      expect.objectContaining({ type: "start" }),
      { type: "event", eventId: "event-1", nodeId: "button", event: "click", x: 10, y: 20, button: 0 },
      { type: "resize", viewport: { width: 640, height: 480 } }, { type: "timer", timerId: "7" },
    ])
    controller.stop(); expect(workers[0].messages.at(-1)).toEqual({ type: "stop" }); expect(workers[0].terminated).toBe(true)
  })

  it("terminates an unresponsive worker without fallback or an automatic restart loop", () => {
    vi.useFakeTimers()
    const workers: FakeWorker[] = []; const errors: Error[] = []
    const controller = new GuideRuntimeController({ workerFactory: () => { const worker = new FakeWorker(); workers.push(worker); return worker }, watchdogMs: 50, onError: (error) => errors.push(error) })
    controller.start(startMessage()); vi.advanceTimersByTime(51)
    expect(workers).toHaveLength(1)
    expect(workers[0].terminated).toBe(true)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/watchdog/)
    vi.advanceTimersByTime(500)
    expect(workers).toHaveLength(1)
    controller.stop()
  })

  it("validates worker responses before dispatching them", () => {
    const worker = new FakeWorker(); const batches: readonly unknown[][] = []; const errors: Error[] = []
    const controller = new GuideRuntimeController({ workerFactory: () => worker, onBatch: (batch) => (batches as unknown[][]).push([...batch]), onError: (error) => errors.push(error) })
    controller.start(startMessage())
    worker.emit({ type: "batch", batchId: "1", operations: [{ op: "create", id: "x", kind: "frame", parentId: "__chronicle_ui_root__", props: { x: 0, y: 0, width: 1, height: 1, anchor: "center" } }] })
    worker.emit({ type: "batch", batchId: "2", operations: "not-an-array" })
    expect(batches).toHaveLength(1); expect(errors.at(-1)?.message).toMatch(/operations must be an array|batch.operations/)
    controller.stop()
  })
})
