import type { PanelPackage } from "../Guides/package/panelLoader"
import { parseWorkerMessage } from "../Guides/protocol/protocol"

export type StartupCheckResult = { ok: boolean; message: string }

/** Starts a fresh sandboxed worker with the package and reports Lua startup only; no events are sent. */
export function runStartupCheck(panel: PanelPackage, signal?: AbortSignal, timeoutMs = 10_000): Promise<StartupCheckResult> {
  return new Promise((resolve, reject) => {
    let runtime: Worker
    try { runtime = new Worker(new URL("../Guides/runtime/panelWorker.ts", import.meta.url), { type: "module" }) }
    catch { resolve({ ok: false, message: "This browser cannot start a Lua worker." }); return }
    const finish = (result: StartupCheckResult | null) => {
      clearTimeout(timer)
      signal?.removeEventListener("abort", abort)
      runtime.terminate()
      if (result) resolve(result)
      else reject(signal?.reason ?? new DOMException("Aborted", "AbortError"))
    }
    const abort = () => finish(null)
    const timer = setTimeout(() => finish({ ok: false, message: `Lua startup timed out after ${timeoutMs / 1000} seconds.` }), timeoutMs)
    if (signal?.aborted) { finish(null); return }
    signal?.addEventListener("abort", abort, { once: true })
    runtime.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (data && typeof data === "object" && "type" in data && data.type === "error") {
        finish({ ok: false, message: `Lua startup failed: ${"message" in data ? String(data.message) : "unknown error"}` })
        return
      }
      try {
        if (parseWorkerMessage(data).type === "ready") finish({ ok: true, message: "Lua startup passed in the browser worker." })
      } catch { finish({ ok: false, message: "Lua worker returned an invalid message." }) }
    }
    runtime.onerror = () => finish({ ok: false, message: "Lua worker failed to start." })
    try { runtime.postMessage({ type: "start", entrypoint: panel.entrypoint, sources: panel.sources, capabilities: panel.capabilities, streams: panel.streams, streamScope: panel.streamScope, maxEvents: panel.maxEvents }) }
    catch { finish({ ok: false, message: "Lua worker could not receive the source package." }) }
  })
}
