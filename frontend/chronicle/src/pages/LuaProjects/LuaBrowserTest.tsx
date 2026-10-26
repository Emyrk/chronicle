import { useEffect, useRef, useState } from "react"
import type { PanelPackage } from "../Guides/package/panelLoader"
import { parseWorkerMessage } from "../Guides/protocol/protocol"

/** A fresh browser worker checks Lua startup without fetching or uploading event data. */
export function LuaBrowserTest({ panel }: { panel: PanelPackage }) {
  const [result, setResult] = useState("")
  const [running, setRunning] = useState(false)
  const worker = useRef<Worker | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stop = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    worker.current?.terminate()
    worker.current = null
    setRunning(false)
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); worker.current?.terminate() }, [])
  function run() {
    stop()
    setResult("")
    let runtime: Worker
    try { runtime = new Worker(new URL("../Guides/runtime/panelWorker.ts", import.meta.url), { type: "module" }) }
    catch { setResult("This browser cannot start a Lua worker."); return }
    worker.current = runtime
    setRunning(true)
    const finish = (message: string) => { if (worker.current === runtime) { stop(); setResult(message) } }
    timer.current = setTimeout(() => finish("Lua startup timed out after 10 seconds."), 10_000)
    runtime.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (data && typeof data === "object" && "type" in data && data.type === "error") {
        finish(`Lua startup failed: ${"message" in data ? String(data.message) : "unknown error"}`)
        return
      }
      try {
        if (parseWorkerMessage(data).type === "ready") finish("Lua startup passed in the browser worker. Event-driven behavior still needs an instance preview.")
      } catch { finish("Lua worker returned an invalid message.") }
    }
    runtime.onerror = () => finish("Lua worker failed to start.")
    try { runtime.postMessage({ type: "start", entrypoint: panel.entrypoint, sources: panel.sources, capabilities: panel.capabilities, streams: panel.streams }) }
    catch { finish("Lua worker could not receive the source package.") }
  }

  return <section className="space-y-2 rounded-xl border border-border bg-card p-4" aria-label="Browser Lua test">
    <h2 className="font-semibold">Browser startup test</h2>
    <p className="text-xs text-muted-foreground">Starts a fresh sandboxed worker with the current unsaved source. It does not call a test service or test event behavior.</p>
    <div className="flex gap-2"><button type="button" disabled={running} onClick={run} className="rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50">{running ? "Running…" : "Run local test"}</button>
      {running && <button type="button" onClick={stop} className="rounded-md border px-3 py-2 text-sm">Cancel</button>}
    </div>
    {result && <p role="status" className="text-sm">{result}</p>}
  </section>
}
