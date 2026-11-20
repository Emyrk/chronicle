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
    {showPopover && <div role="dialog" aria-label="Coding agent" className="absolute right-0 top-full z-40 mt-1.5 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-background text-xs shadow-xl">
      <div className="flex items-start gap-3 p-3">
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-md ${state.badge}`}><Bot className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <p role="status" className="text-sm font-medium leading-tight">{state.title}</p>
          {state.detail && <p className="mt-1 leading-relaxed text-muted-foreground">{state.detail}</p>}
        </div>
      </div>
      {mcp.active && mcp.lastCall && !mcp.error && <div className="mx-3 mb-3 flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5">
        <span className="text-muted-foreground">Last call</span>
        <code className="min-w-0 truncate font-mono">{mcp.lastCall.toolName}</code>
        <span className={`ml-auto shrink-0 ${mcp.lastCall.state === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {mcp.lastCall.state === "running" ? "running…" : `${mcp.lastCall.state === "error" ? "failed · " : ""}${ago(mcp.lastCall.at, now)}`}</span>
      </div>}
      {mcp.error && <p role="alert" className="mx-3 mb-3 rounded-md bg-destructive/10 px-2.5 py-2 leading-relaxed text-destructive">{mcp.error}. Start chronicle-mcp in your agent, check its allowed origins and the browser's local-network permission, then disconnect and retry.</p>}
      {mcp.actionError && <p role="alert" className="mx-3 mb-3 rounded-md bg-destructive/10 px-2.5 py-2 text-destructive">{mcp.actionError}</p>}
      {mcp.active && <ConnectionDetails mcp={mcp} />}
      <div className="flex items-center gap-2 border-t border-border bg-muted/20 px-3 py-2">
        <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground" title="Tool output, page URL, player names and encounter data from this tab are sent to your local agent.">Tab data is shared with your agent.</p>
        {mcp.active ? <>
          {mcp.connection?.owner && <button type="button" className={popoverButton} disabled={mcp.revoking || !!mcp.error} onClick={() => void mcp.revoke()}
            title="Cancel the agent's work and make it select this tab again">{mcp.revoking ? "Revoking…" : "Revoke"}</button>}
          <button type="button" className={`${popoverButton} hover:border-destructive/50 hover:text-destructive`} onClick={() => { mcp.disconnect(); setOpen(false) }}><Unplug className="size-3.5" /> Disconnect</button>
        </> : <a className={popoverButton} href={MCP_SETUP_URL} target="_blank" rel="noreferrer">Setup guide <ExternalLink className="size-3" /></a>}
      </div>
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
  const renamed = trimmed !== mcp.name
  const valid = !!trimmed && [...trimmed].length <= 80
  const connection = mcp.connection
  return <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 border-t border-border px-3 py-2.5">
    <dt className="text-muted-foreground" title="The name your agent sees in list_connections">Tab name</dt>
    <dd><form className="flex items-center gap-1" onSubmit={event => { event.preventDefault(); if (valid && renamed) mcp.rename(draft) }}>
      <input aria-label="Connection name" value={draft} onChange={event => setDraft(event.target.value)}
        className="h-7 min-w-0 flex-1 rounded-md border border-transparent bg-muted/40 px-2 outline-none hover:border-border focus:border-primary/60" />
      {renamed && <button type="submit" disabled={!valid} className="h-7 rounded-md bg-primary px-2 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Save</button>}
    </form></dd>
    {connection && <>
      <dt className="text-muted-foreground">Connection</dt>
      <dd className="flex min-w-0 items-center gap-1">
        <code className="min-w-0 truncate font-mono text-muted-foreground" title={connection.id}>{connection.id}</code>
        <button type="button" aria-label="Copy connection ID" title="Copy connection ID" className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => {
          void navigator.clipboard.writeText(connection.id).then(() => setCopied(true), () => {})
        }}>{copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}</button>
      </dd>
      <dt className="text-muted-foreground">Agent</dt>
      <dd className="min-w-0 truncate">{connection.owner ? <code className="font-mono text-muted-foreground" title={connection.owner.id}>{connection.owner.id}</code>
        : <span className="text-muted-foreground">None yet</span>}</dd>
    </>}
  </dl>
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
