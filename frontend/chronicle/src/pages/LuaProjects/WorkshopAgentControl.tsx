import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react"
import { Bot, Check, ChevronDown, Copy, ExternalLink, LoaderCircle, Plug, Unplug } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useOptionalLocalMcp, type LocalMcpContextValue } from "@/features/chat/mcp/LocalMcpProvider"
import { probeLocalMcp } from "@/features/chat/mcp/localBridge"

export const MCP_SETUP_URL = "https://github.com/Emyrk/chronicle-mcp"
const promptDismissedKey = "chronicle-local-mcp-prompt-dismissed"

function ago(at: number, now: number) {
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 5) return "just now"
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`
}

function useNow(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const timer = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(timer)
  }, [enabled])
  return now
}

const popoverButton = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-50"

/**
 * The workshop's primary mode, docked in the header: a local coding agent driving this tab through
 * chronicle-mcp. The pill shows its status; the popover holds the details and actions.
 */
export function WorkshopAgentControl() {
  const mcp = useOptionalLocalMcp()
  const dock = mcp?.dock
  // While mounted, the pill replaces the site-wide floating connection panel.
  useEffect(() => dock?.(), [dock])
  const [open, setOpen] = useState(false)
  // A new connection error opens the popover once so its explanation is seen.
  const [seenError, setSeenError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const now = useNow(!!mcp?.lastCall)
  const showPopover = open || (!!mcp?.error && seenError !== mcp.error)
  const close = () => { setOpen(false); setSeenError(mcp?.error ?? null) }
  const dismiss = useEffectEvent(close)

  useEffect(() => {
    if (!showPopover) return
    const onPointer = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) dismiss() }
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss() }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey) }
  }, [showPopover])
  if (!mcp) return null

  const state = agentState(mcp)
  const toggle = () => showPopover ? close() : setOpen(true)
  return <div ref={ref} className="relative">
    {!mcp.active ? <div className="flex items-stretch overflow-hidden rounded-md bg-primary text-primary-foreground">
      <button type="button" disabled={mcp.safeMode} onClick={mcp.connect} title="Connect this tab to chronicle-mcp so your coding agent can drive it"
        className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
        <Plug className="size-3.5" /> Connect agent</button>
      <button type="button" aria-label="About coding agents" aria-expanded={showPopover} onClick={toggle}
        className="border-l border-primary-foreground/20 px-1.5 hover:bg-primary/90"><ChevronDown className="size-3.5" /></button>
    </div> : <button type="button" aria-expanded={showPopover} aria-label={`Coding agent: ${state.label}`} onClick={toggle}
      className={`inline-flex max-w-56 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${state.pill}`}>
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${state.dot}`} />
      <span className="truncate">{state.label}</span>
      {mcp.busy && <LoaderCircle aria-label="Agent tool running" className="size-3.5 shrink-0 animate-spin" />}
      <ChevronDown className="size-3.5 shrink-0 opacity-60" />
    </button>}
    {showPopover && <div role="dialog" aria-label="Coding agent" className="absolute right-0 top-full z-40 mt-1.5 w-96 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-background p-3 text-xs shadow-xl">
      <div className="flex items-start gap-2.5">
        <span className={`flex size-7 shrink-0 items-center justify-center rounded-md ${state.badge}`}><Bot className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <p role="status" className="text-sm font-medium">{state.title}</p>
          {state.detail && <p className="mt-0.5 text-muted-foreground">{state.detail}</p>}
          {mcp.active && mcp.lastCall && !mcp.error && <p className="mt-1 text-muted-foreground">
            Last call <code className="font-mono text-foreground">{mcp.lastCall.toolName}</code>
            {" · "}{mcp.lastCall.state === "running" ? "running…" : <>{mcp.lastCall.state === "error" && <span className="text-destructive">failed · </span>}{ago(mcp.lastCall.at, now)}</>}
          </p>}
        </div>
      </div>
      {mcp.error && <p role="alert" className="mt-2 text-destructive">{mcp.error}. Start chronicle-mcp in your agent, check its allowed origins and the browser's local-network permission, then disconnect and retry.</p>}
      {mcp.actionError && <p role="alert" className="mt-2 text-destructive">{mcp.actionError}</p>}
      {mcp.active && <ConnectionDetails mcp={mcp} />}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {mcp.active ? <>
          {mcp.connection?.owner && <button type="button" className={popoverButton} disabled={mcp.revoking || !!mcp.error} onClick={() => void mcp.revoke()}
            title="Cancel the agent's work and make it select this tab again">{mcp.revoking ? "Revoking…" : "Revoke agent"}</button>}
          <button type="button" className={popoverButton} onClick={() => { mcp.disconnect(); setOpen(false) }}><Unplug className="size-3.5" /> Disconnect</button>
        </> : <a className={popoverButton} href={MCP_SETUP_URL} target="_blank" rel="noreferrer">Setup guide <ExternalLink className="size-3" /></a>}
      </div>
      <p className="mt-3 text-muted-foreground">Tool output, player names and encounter data from this tab are sent to your local agent.</p>
    </div>}
  </div>
}

function agentState(mcp: LocalMcpContextValue): { label: string; title: ReactNode; detail: ReactNode; dot: string; badge: string; pill: string } {
  const idle = { badge: "bg-muted text-muted-foreground", pill: "border-border text-muted-foreground hover:bg-accent" }
  if (mcp.safeMode) return { ...idle, label: "Agent disabled", title: "Local agent disabled", detail: "?safe=1 turns off local MCP for this tab.", dot: "bg-muted-foreground" }
  if (!mcp.active) return { ...idle, label: "No agent", title: "Build this module with your coding agent",
    detail: "Run chronicle-mcp in Claude Code, Cursor or any MCP client, then connect this tab. Your agent edits, previews and saves here.", dot: "bg-muted-foreground" }
  if (mcp.error) return { label: "Agent connection failed", title: "Local agent connection failed", detail: "", dot: "bg-destructive",
    badge: "bg-destructive/15 text-destructive", pill: "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20" }
  if (mcp.status === "connecting") return { ...idle, label: "Connecting…", title: "Connecting to chronicle-mcp…", detail: "Looking for the local MCP server on 127.0.0.1:17643.", dot: "animate-pulse bg-sky-400" }
  if (mcp.status === "reconnecting") return { ...idle, label: "Reconnecting…", title: "Reconnecting to chronicle-mcp…", detail: "The local MCP server stopped answering.", dot: "animate-pulse bg-amber-400" }
  const owner = mcp.connection?.owner
  if (!owner) return { label: "Waiting for agent", title: "Tab ready · waiting for your agent",
    detail: <>Ask your agent to <code className="font-mono">list_connections</code> and select <span className="text-foreground">“{mcp.name}”</span>.</>,
    dot: "bg-sky-400", badge: "bg-sky-500/15 text-sky-300", pill: "border-sky-500/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20" }
  return { label: owner.name, title: <>{owner.name} <span className="font-normal text-muted-foreground">{owner.version}</span> is driving this tab</>,
    detail: "It can read, edit, preview and save to main. Releases stay with you.",
    dot: "bg-emerald-400", badge: "bg-emerald-500/15 text-emerald-300", pill: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20" }
}

function ConnectionDetails({ mcp }: { mcp: LocalMcpContextValue }) {
  const [draft, setDraft] = useState(mcp.name)
  const [copied, setCopied] = useState(false)
  const trimmed = draft.trim()
  const connection = mcp.connection
  return <div className="mt-3 border-t border-border pt-3">
    <form className="flex items-end gap-2" onSubmit={event => { event.preventDefault(); mcp.rename(draft) }}>
      <label className="min-w-0 flex-1">Name your agent sees
        <input aria-label="Connection name" className="mt-1 w-full rounded border border-border bg-background px-2 py-1" value={draft} onChange={event => setDraft(event.target.value)} />
      </label>
      <button type="submit" className="rounded border border-border px-2 py-1 hover:bg-accent disabled:opacity-50" disabled={!trimmed || [...trimmed].length > 80 || trimmed === mcp.name}>Rename</button>
    </form>
    {connection && <div className="mt-2 space-y-1 break-words">
      <p className="flex items-center gap-1">Connection ID <code className="select-all font-mono text-muted-foreground">{connection.id}</code>
        <button type="button" aria-label="Copy connection ID" className="rounded p-0.5 hover:bg-accent" onClick={() => {
          void navigator.clipboard.writeText(connection.id).then(() => setCopied(true), () => {})
        }}>{copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}</button></p>
      {connection.owner ? <p>Agent ID <code className="select-all font-mono text-muted-foreground">{connection.owner.id}</code></p>
        : <p className="text-muted-foreground">No agent has selected this connection yet.</p>}
    </div>}
  </div>
}

/**
 * Offers to reconnect when chronicle-mcp is already running. Only probes after this
 * browser has connected once: the probe can trigger a local-network permission prompt.
 */
export function ConnectAgentPrompt() {
  const mcp = useOptionalLocalMcp()
  const [open, setOpen] = useState(false)
  const eligible = !!mcp && !mcp.active && !mcp.safeMode && mcp.usedBefore
  useEffect(() => {
    if (!eligible) return
    try { if (sessionStorage.getItem(promptDismissedKey) === "1") return } catch { /* prompt anyway */ }
    const abort = new AbortController()
    void probeLocalMcp(abort.signal).then(found => { if (found && !abort.signal.aborted) setOpen(true) })
    return () => abort.abort()
    // Probe once per visit, not on every connection-state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const dismiss = () => {
    setOpen(false)
    try { sessionStorage.setItem(promptDismissedKey, "1") } catch { /* asks again next visit */ }
  }
  return <Dialog open={open && eligible} onOpenChange={next => { if (!next) dismiss() }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Bot className="size-5 text-emerald-400" /> Connect your local agent?</DialogTitle>
        <DialogDescription>chronicle-mcp is running on this computer. Connect this tab so your agent can edit, preview and save the module.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent" onClick={dismiss}>Not now</button>
        <button type="button" autoFocus className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          onClick={() => { setOpen(false); mcp?.connect() }}><Plug className="size-4" /> Connect</button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
