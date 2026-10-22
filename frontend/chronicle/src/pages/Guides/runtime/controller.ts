import { parseHostMessage, parseWorkerMessage } from "../protocol/protocol"
import type { HostMessage, SceneOperation } from "../protocol/types"

type StartMessage = Extract<HostMessage, { type: "start" }>
type EventMessage = Extract<HostMessage, { type: "event" }>

export interface WorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: unknown): void
  terminate(): void
}

export interface GuideRuntimeControllerOptions {
  workerFactory?: (url: URL, options: WorkerOptions) => WorkerLike
  watchdogMs?: number
  startupWatchdogMs?: number
  onReady?: () => void
  onBatch?: (operations: readonly SceneOperation[]) => void
  onError?: (error: Error) => void
}

export class GuideRuntimeController {
  private worker: WorkerLike | null = null
  private watchdog: ReturnType<typeof setTimeout> | null = null
  private lastStart: StartMessage | null = null
  private pendingEventId: string | null = null
  private stopped = false
  private generation = 0
  private readonly workerFactory: (url: URL, options: WorkerOptions) => WorkerLike
  private readonly watchdogMs: number
  private readonly startupWatchdogMs: number
  private readonly options: GuideRuntimeControllerOptions

  constructor(options: GuideRuntimeControllerOptions = {}) {
    this.options = options
    this.workerFactory = options.workerFactory ?? ((url, workerOptions) => new Worker(url, workerOptions))
    this.watchdogMs = options.watchdogMs ?? 2_000
    this.startupWatchdogMs = options.startupWatchdogMs ?? options.watchdogMs ?? 10_000
  }

  start(message: StartMessage) {
    this.stopped = false
    this.lastStart = parseHostMessage(message) as StartMessage
    this.replaceWorker()
  }

  event(message: Omit<EventMessage, "type">) {
    const parsed = parseHostMessage({ type: "event", ...message }) as EventMessage
    this.pendingEventId = parsed.eventId
    this.send(parsed)
    this.armWatchdog()
  }

  resize(width: number, height: number) { this.send(parseHostMessage({ type: "resize", viewport: { width, height } })) }
  timer(timerId: string) { this.send(parseHostMessage({ type: "timer", timerId })) }

  stop(reason?: string) {
    this.stopped = true; this.generation += 1; this.clearWatchdog()
    if (this.worker) { this.worker.postMessage(parseHostMessage(reason ? { type: "stop", reason } : { type: "stop" })); this.worker.terminate(); this.worker = null }
    this.lastStart = null; this.pendingEventId = null
  }

  private replaceWorker() {
    this.clearWatchdog(); this.worker?.terminate()
    const generation = ++this.generation
    const worker = this.workerFactory(new URL("./worker.ts", import.meta.url), { type: "module" })
    this.worker = worker
    worker.onmessage = (event) => { if (generation === this.generation) this.handleMessage(event.data) }
    worker.onerror = (event) => { if (generation === this.generation) this.handleWorkerFailure(new Error(event.message || "guide worker failed")) }
    if (this.lastStart) { worker.postMessage(this.lastStart); this.armWatchdog(this.startupWatchdogMs) }
  }

  private send(message: HostMessage) {
    if (!this.worker || !this.lastStart || this.stopped) throw new Error("guide runtime controller is not running")
    this.worker.postMessage(message)
  }

  private handleMessage(rawMessage: unknown) {
    try {
      const message = parseWorkerMessage(rawMessage)
      if (message.type === "ready") { this.clearWatchdog(); this.options.onReady?.() }
      else if (message.type === "batch") this.options.onBatch?.(message.operations)
      else if (message.type === "ack") {
        if (message.eventId === this.pendingEventId) { this.pendingEventId = null; this.clearWatchdog() }
      } else {
        const error = new Error(message.message)
        if (message.fatal) this.handleWorkerFailure(error)
        else this.options.onError?.(error)
      }
    } catch (error) { this.options.onError?.(error instanceof Error ? error : new Error(String(error))) }
  }

  private handleWorkerFailure(error: Error) {
    if (this.stopped) return
    this.stopped = true
    this.clearWatchdog()
    this.generation += 1
    this.worker?.terminate()
    this.worker = null
    this.pendingEventId = null
    this.options.onError?.(error)
  }
  private armWatchdog(timeoutMs = this.watchdogMs) {
    this.clearWatchdog()
    this.watchdog = setTimeout(() => { this.watchdog = null; this.handleWorkerFailure(new Error("guide worker watchdog expired")) }, timeoutMs)
  }
  private clearWatchdog() { if (this.watchdog) clearTimeout(this.watchdog); this.watchdog = null }
}
