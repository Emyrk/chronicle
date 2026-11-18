/* eslint-disable react-refresh/only-export-components -- Shared context and its hook live together. */
import { createContext, useCallback, useContext, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { useBlocker, useLocation } from "react-router-dom"
import { useInferenceRuntime } from "../runtime"
import { availableBrowserTools, executeBrowserCommand, loadToolCatalog, type BrowserPage } from "./browserTools"
import { connectLocalMcp } from "./localBridge"

interface LocalMcpContextValue { active: boolean; connect: () => void; disconnect: () => void }
const LocalMcpContext = createContext<LocalMcpContextValue | null>(null)
export const useOptionalLocalMcp = () => useContext(LocalMcpContext)

/** One explicit tab connection persists across routes; each navigation gets a fresh generation. */
export function LocalMcpProvider({ children }: { children: ReactNode }) {
  const runtime = useInferenceRuntime()
  const location = useLocation()
  const [active, setActive] = useState(false)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState("")
  const safeMode = new URLSearchParams(location.search).get("safe") === "1"
  const url = typeof window === "undefined" ? location.pathname : window.location.origin + location.pathname + location.search
  const current = useRef<BrowserPage>({ url, generation: "", sessionId: runtime.sessionId })
  const pageAbort = useRef(new AbortController())
  useLayoutEffect(() => {
    // A generation belongs to a committed visit, not a memoized URL/history entry.
    // Returning via Back must never revive the previous visit's tool authority.
    current.current = { url, generation: `${location.key}:${crypto.randomUUID()}`, sessionId: runtime.sessionId }
    pageAbort.current.abort()
    pageAbort.current = new AbortController()
    return () => pageAbort.current.abort()
  }, [location.key, url, runtime.sessionId])
  const currentRuntime = useEffectEvent(() => runtime)
  const disconnect = useCallback(() => { setActive(false); setConnected(false); setError("") }, [])
  const connect = useCallback(() => {
    if (safeMode) return
    setError(""); setConnected(false); setActive(true)
  }, [safeMode])

  useEffect(() => {
    if (!active || safeMode) return
    const abort = new AbortController()
    void loadToolCatalog(abort.signal).then(catalog => connectLocalMcp({
      signal: abort.signal,
      current: () => {
        const available = currentRuntime().getAvailableTools?.() ?? []
        const tools = availableBrowserTools(catalog, available.map(item => item.capability))
          .filter(tool => available.some(item => item.capability.id === tool.capability.id && item.names.includes(tool.name)))
        return { page: current.current, tools }
      },
      execute: (command, snapshot, tools, signal) => executeBrowserCommand(command, snapshot, tools, currentRuntime(),
        () => current.current, AbortSignal.any([signal, pageAbort.current.signal])),
      connected: () => setConnected(true),
    })).catch(reason => { if (!abort.signal.aborted) { setError(reason instanceof Error ? reason.message : "MCP connection failed"); setConnected(false) } })
    return () => abort.abort()
  }, [active, safeMode])

  // Block PUSH, REPLACE and POP before the location (and page generation) changes.
  // The connection remains explicit and follows the approved tab after confirmation.
  const blocker = useBlocker(active)
  useEffect(() => {
    if (blocker.state !== "blocked") return
    if (window.confirm("Leave this page? Pending MCP calls will be canceled and the connected agent will see the next page’s tools. Unsaved source changes may be discarded.")) blocker.proceed()
    else blocker.reset()
  }, [blocker])

  // Reload, tab close and external links use the browser's own warning dialog.
  useEffect(() => {
    if (!active) return
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", unload)
    return () => window.removeEventListener("beforeunload", unload)
  }, [active])

  const confirmation = runtime.pendingConfirmation
  const localConfirmation = confirmation?.runId.startsWith("local-mcp:") ? confirmation : null
  return <LocalMcpContext.Provider value={{ active, connect, disconnect }}>
    {children}
    {active && <aside aria-label="Local MCP connection" className="fixed bottom-4 left-4 z-[100] max-w-sm rounded-md border border-border bg-background p-3 text-xs shadow-lg">
      <p className="font-semibold">{error ? "Local MCP unavailable" : connected ? "Local MCP connected" : "Connecting to local MCP…"}</p>
      <p className="mt-1 text-muted-foreground">Your agent can use this page’s tools and read their output. Modules use the browser working copy, not files on disk.</p>
      {error && <p role="alert" className="mt-2 text-destructive">{error}. Start the MCP server in your agent, check allowed origins and browser local-network permission, then disconnect and retry.</p>}
      {safeMode && <p>Local MCP is disabled by ?safe=1.</p>}
      <button type="button" className="mt-2 rounded border px-2 py-1 hover:bg-accent" onClick={disconnect}>Disconnect local MCP</button>
      {localConfirmation && <div role="alertdialog" aria-label="Approve local MCP tool" className="mt-3 border-t pt-2">
        <p>Allow <strong>{localConfirmation.toolName}</strong>?</p>
        <p className="mt-1 text-muted-foreground">{localConfirmation.toolName === "save_lua_files" ? "Save the browser working copy to main. This does not tag a release." : "This changes the current page."}</p>
        <pre className="styled-scrollbar mt-2 max-h-32 overflow-auto whitespace-pre-wrap">{JSON.stringify(localConfirmation.arguments, null, 2)}</pre>
        <div className="mt-2 flex gap-2">
          <button type="button" className="rounded border px-2 py-1" onClick={() => runtime.resolveConfirmation(true)}>Allow</button>
          <button type="button" className="rounded border px-2 py-1" onClick={() => runtime.resolveConfirmation(false)}>Reject</button>
        </div>
      </div>}
    </aside>}
  </LocalMcpContext.Provider>
}
