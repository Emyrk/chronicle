import { useEffect, useRef, useState } from "react"
import type { PanelPackage } from "../Guides/package/panelLoader"
import { runStartupCheck, type StartupCheckResult } from "./startupCheck"

/** A fresh browser worker checks Lua startup without fetching or uploading event data. */
export function LuaBrowserTest({ panel }: { panel: PanelPackage }) {
  const [result, setResult] = useState<StartupCheckResult | null>(null)
  const [running, setRunning] = useState(false)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  function run() {
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    setResult(null)
    setRunning(true)
    runStartupCheck(panel, abort.signal).then(setResult, () => {}).finally(() => {
      if (controller.current === abort) { controller.current = null; setRunning(false) }
    })
  }

  return <div className="flex min-w-0 items-center gap-2" aria-label="Module startup check">
    <button type="button" disabled={running} onClick={run} title="Load the unsaved source in a sandboxed worker. No events are processed."
      className="whitespace-nowrap rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-50">{running ? "Checking…" : "Startup check"}</button>
    {result && <p role="status" title={result.message} className={`truncate text-xs ${result.ok ? "text-emerald-400" : "text-destructive"}`}>{result.ok ? "✓ Passed" : result.message}</p>}
  </div>
}
