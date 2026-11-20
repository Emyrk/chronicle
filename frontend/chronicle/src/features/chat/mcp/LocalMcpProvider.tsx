/* eslint-disable react-refresh/only-export-components -- Shared context and its hook live together. */
import { createContext, useCallback, useContext, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { useBlocker, useLocation } from "react-router-dom"
import { useInferenceRuntime } from "../runtime"
import { availableBrowserTools, executeBrowserCommand, loadToolCatalog, type BrowserPage } from "./browserTools"
import { connectLocalMcp, type BridgeConnection } from "./localBridge"
import { pageGuidanceRegistration } from "./pageGuidance"

interface LocalMcpContextValue { active: boolean; connect: () => void; disconnect: () => void }
const LocalMcpContext = createContext<LocalMcpContextValue | null>(null)
export const useOptionalLocalMcp = () => useContext(LocalMcpContext)

/** One explicit tab connection persists across routes; each navigation gets a fresh generation. */
export function LocalMcpProvider({ children }: { children: ReactNode }) {
  const runtime = useInferenceRuntime()
  const location = useLocation()
  const [active, setActive] = useState(false)
  const [status, setStatus] = useState<"connecting" | "connected" | "reconnecting">("connecting")
  const [connection, setConnection] = useState<BridgeConnection | null>(null)
  const [name, setName] = useState("")
  const [nameDraft, setNameDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [actionError, setActionError] = useState("")
  const controls = useRef<{ revoke: () => Promise<void> } | null>(null)
  const connectionAbort = useRef<AbortController | null>(null)
  const connectionName = useRef("")
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
  const confirmation = runtime.pendingConfirmation
  const localConfirmation = confirmation?.runId.startsWith("local-mcp:") ? confirmation : null
  const confirmCancellation = () => !(busy || localConfirmation) || window.confirm("Cancel pending MCP work and approvals?")
  const disconnect = () => {
    if (!confirmCancellation()) return
    connectionAbort.current?.abort()
    controls.current = null
    setActive(false); setConnection(null); setBusy(false); setError(""); setActionError("")
  }
  const revoke = async () => {
    if (!controls.current || !confirmCancellation()) return
    setRevoking(true); setActionError("")
    const signal = connectionAbort.current?.signal
    try { await controls.current.revoke() }
    catch (reason) {
      if (!signal?.aborted) setActionError(reason instanceof Error ? reason.message : "Could not revoke agent access. Disconnect and retry.")
    } finally { if (!signal?.aborted) setRevoking(false) }
  }
  const connect = useCallback(() => {
    if (safeMode || active) return
    // Runtime scopes identify the module/instance; otherwise the route is useful
    // without copying potentially sensitive query parameters into a display name.
    const capability = runtime.capabilities?.find(item => item.id === "lua-editor")
    const defaultName = [...(capability?.scope_id ? `Module ${capability.scope_id}` : `Chronicle ${location.pathname}`)].slice(0, 80).join("").trim()
    connectionName.current = defaultName
    setName(defaultName); setNameDraft(defaultName)
    setError(""); setActionError(""); setConnection(null); setBusy(false); setRevoking(false); setStatus("connecting"); setActive(true)
  }, [safeMode, active, runtime.capabilities, location.pathname])

  const registerCapability = runtime.registerCapability
  useEffect(() => {
    if (!active || safeMode) return
    return registerCapability(pageGuidanceRegistration(current.current, () => currentRuntime()))
  }, [active, safeMode, location.key, url, runtime.sessionId, registerCapability])

  useEffect(() => {
    if (!active || safeMode) return
    const abort = new AbortController()
    connectionAbort.current = abort
    void loadToolCatalog(abort.signal).then(catalog => connectLocalMcp({
      signal: abort.signal,
      current: () => {
        const available = currentRuntime().getAvailableTools?.() ?? []
        const tools = availableBrowserTools(catalog, available.map(item => item.capability))
          .filter(tool => available.some(item => item.capability.id === tool.capability.id && item.names.includes(tool.name)))
        return { page: current.current, tools, name: connectionName.current }
      },
      execute: (command, snapshot, tools, signal) => executeBrowserCommand(command, snapshot, tools, currentRuntime(),
        () => current.current, AbortSignal.any([signal, pageAbort.current.signal])),
      connected: () => { if (!abort.signal.aborted) setStatus("connected") },
      changed: (value: BridgeConnection) => { if (!abort.signal.aborted) setConnection(value) },
      status: (value: "connected" | "reconnecting") => { if (!abort.signal.aborted) setStatus(value) },
      busy: (value: boolean) => { if (!abort.signal.aborted) setBusy(value) },
      controls: (value: { revoke: () => Promise<void> }) => { if (!abort.signal.aborted) controls.current = value },
    })).catch(reason => { if (!abort.signal.aborted) { setError(reason instanceof Error ? reason.message : "MCP connection failed") } })
    return () => {
      abort.abort()
      controls.current = null
      connectionAbort.current = null
    }
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

  return <LocalMcpContext.Provider value={{ active, connect, disconnect }}>
    {children}
    {active && <aside aria-label="Local MCP connection" className="styled-scrollbar fixed bottom-4 left-4 z-[100] max-h-[calc(100vh-2rem)] max-w-sm overflow-auto rounded-md border border-border bg-background p-3 text-xs shadow-lg">
      <p className="font-semibold">{error ? "Local MCP error" : status === "connected" ? "Local MCP connected" : status === "reconnecting" ? "Reconnecting to local MCP…" : "Connecting to local MCP…"}</p>
      <p className="mt-1 text-muted-foreground">Your agent can use this page’s tools and read their output. Modules use the browser working copy, not files on disk.</p>
      {error && <p role="alert" className="mt-2 text-destructive">{error}. Start the MCP server in your agent, check allowed origins and browser local-network permission, then disconnect and retry.</p>}
      <form className="mt-2 flex gap-2" onSubmit={event => {
        event.preventDefault()
        const value = nameDraft.trim()
        if (!value || [...value].length > 80) return
        connectionName.current = value
        setName(value)
      }}>
        <label className="min-w-0 flex-1">Connection name
          <input aria-label="Connection name" className="mt-1 w-full rounded border bg-background px-2 py-1" value={nameDraft} onChange={event => setNameDraft(event.target.value)} />
        </label>
        <button type="submit" className="self-end rounded border px-2 py-1" disabled={!nameDraft.trim() || [...nameDraft.trim()].length > 80 || nameDraft.trim() === name}>Rename</button>
      </form>
      {connection && <div className="mt-2 break-words">
        <p>Connection ID: <code className="select-all">{connection.id}</code></p>
        <button type="button" className="mt-1 rounded border px-2 py-1" onClick={async () => {
          setActionError("")
          try { await navigator.clipboard.writeText(connection.id) }
          catch { setActionError("Could not copy the ID. Select the connection ID and copy it manually.") }
        }}>Copy connection ID</button>
        {connection.owner ? <div className="mt-2">
          <p>Agent: {connection.owner.name}</p>
          <p>Version: {connection.owner.version}</p>
          <p>Agent ID: <code className="select-all">{connection.owner.id}</code></p>
          <button type="button" className="mt-2 rounded border px-2 py-1" disabled={revoking || !!error} onClick={() => void revoke()}>{revoking ? "Revoking…" : "Revoke agent access"}</button>
        </div> : <p className="mt-2 text-muted-foreground">No agent owns this connection. Available; waiting for an agent to select it.</p>}
      </div>}
      {actionError && <p role="alert" className="mt-2 text-destructive">{actionError}</p>}
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
