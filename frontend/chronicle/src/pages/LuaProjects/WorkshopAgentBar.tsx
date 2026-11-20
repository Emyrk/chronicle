import { Fragment, useEffect, useState, type ReactNode } from "react"
import { Bot, Check, Copy, ExternalLink, LoaderCircle, MessageSquare, Plug, Settings2, Unplug, X } from "lucide-react"
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

const barButton = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-50"

/** The workshop's primary mode: a local coding agent driving this tab through chronicle-mcp. */
export function WorkshopAgentBar({ chatOpen, onToggleChat }: { chatOpen: boolean; onToggleChat: () => void }) {
  const mcp = useOptionalLocalMcp()
  const dock = mcp?.dock
  // While the bar is mounted it replaces the site-wide floating connection panel.
  useEffect(() => dock?.(), [dock])
  const [detailsOpen, setDetailsOpen] = useState(false)
  const now = useNow(!!mcp?.lastCall)
  const chatButton = <button type="button" aria-pressed={chatOpen} onClick={onToggleChat} title="Chat with Chronicle's in-browser assistant instead"
    className={`${barButton} ${chatOpen ? "border-primary/60 bg-primary/10 text-foreground" : "text-muted-foreground"}`}>
    <MessageSquare className="size-3.5" /> Browser chat</button>
  if (!mcp) return null

  const state = agentState(mcp)
  return <section aria-label="Coding agent" className={`relative flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2 ${state.surface}`}>
    <span className={`flex size-7 shrink-0 items-center justify-center rounded-md ${state.badge}`}><Bot className="size-4" /></span>
    <div className="min-w-0 flex-1">
      <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${state.dot}`} />
        <span role="status">{state.title}</span>
        {mcp.active && mcp.busy && <LoaderCircle aria-label="Agent tool running" className="size-3.5 animate-spin text-primary" />}
      </p>
      <p className="truncate text-xs text-muted-foreground">
        {mcp.lastCall && mcp.active && !mcp.error ? <>
          Last call <code className="font-mono text-foreground">{mcp.lastCall.toolName}</code>
          {" · "}{mcp.lastCall.state === "running" ? "running…" : <>{mcp.lastCall.state === "error" && <span className="text-destructive">failed · </span>}{ago(mcp.lastCall.at, now)}</>}
        </> : state.detail}
      </p>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {!mcp.active ? <Fragment key="idle">
        <a className={`${barButton} text-muted-foreground`} href={MCP_SETUP_URL} target="_blank" rel="noreferrer">Setup guide <ExternalLink className="size-3" /></a>
        <button type="button" disabled={mcp.safeMode} onClick={mcp.connect}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          <Plug className="size-3.5" /> Connect local agent</button>
      </Fragment> : <Fragment key="active">
        {mcp.connection?.owner && <button type="button" className={barButton} disabled={mcp.revoking || !!mcp.error} onClick={() => void mcp.revoke()}
          title="Cancel the agent's work and make it select this tab again">{mcp.revoking ? "Revoking…" : "Revoke agent"}</button>}
        <button type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(open => !open)} className={barButton} title="Connection name and IDs">
          <Settings2 className="size-3.5" /> Connection</button>
        <button type="button" className={barButton} onClick={mcp.disconnect}><Unplug className="size-3.5" /> Disconnect</button>
      </Fragment>}
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      {chatButton}
    </div>
    {mcp.error && <p role="alert" className="basis-full text-xs text-destructive">{mcp.error}. Start chronicle-mcp in your agent, check its allowed origins and the browser's local-network permission, then disconnect and retry.</p>}
    {mcp.actionError && <p role="alert" className="basis-full text-xs text-destructive">{mcp.actionError}</p>}
    {detailsOpen && mcp.active && <ConnectionDetails mcp={mcp} onClose={() => setDetailsOpen(false)} />}
  </section>
}

function agentState(mcp: LocalMcpContextValue): { title: ReactNode; detail: ReactNode; dot: string; badge: string; surface: string } {
  const idle = { badge: "bg-muted text-muted-foreground", surface: "border-border bg-card/40" }
  if (mcp.safeMode) return { ...idle, title: "Local agent disabled", detail: "?safe=1 turns off local MCP for this tab.", dot: "bg-muted-foreground" }
  if (!mcp.active) return { ...idle, title: "Build this module with your coding agent",
    detail: "Run chronicle-mcp in Claude Code, Cursor or any MCP client, then connect this tab. Your agent edits, previews and saves here.", dot: "bg-muted-foreground" }
  if (mcp.error) return { title: "Local agent connection failed", detail: "", dot: "bg-destructive", badge: "bg-destructive/15 text-destructive", surface: "border-destructive/40 bg-destructive/5" }
  if (mcp.status === "connecting") return { ...idle, title: "Connecting to chronicle-mcp…", detail: "Looking for the local MCP server on 127.0.0.1:17643.", dot: "animate-pulse bg-sky-400" }
  if (mcp.status === "reconnecting") return { ...idle, title: "Reconnecting to chronicle-mcp…", detail: "The local MCP server stopped answering.", dot: "animate-pulse bg-amber-400" }
  const owner = mcp.connection?.owner
  if (!owner) return { title: "Tab ready · waiting for your agent",
    detail: <>Ask your agent to <code className="font-mono">list_connections</code> and select <span className="text-foreground">“{mcp.name}”</span>.</>,
    dot: "bg-sky-400", badge: "bg-sky-500/15 text-sky-300", surface: "border-sky-500/30 bg-sky-500/5" }
  return { title: <>{owner.name} <span className="font-normal text-muted-foreground">{owner.version}</span> is driving this tab</>,
    detail: "It can read, edit, preview and save to main. Releases stay with you.",
    dot: "bg-emerald-400", badge: "bg-emerald-500/15 text-emerald-300", surface: "border-emerald-500/30 bg-emerald-500/5" }
}

function ConnectionDetails({ mcp, onClose }: { mcp: LocalMcpContextValue; onClose: () => void }) {
  const [draft, setDraft] = useState(mcp.name)
  const [copied, setCopied] = useState(false)
  const trimmed = draft.trim()
  const connection = mcp.connection
  return <div role="dialog" aria-label="Connection details" className="absolute right-4 top-full z-30 mt-1 w-80 rounded-md border border-border bg-background p-3 text-xs shadow-lg">
    <div className="flex items-center justify-between">
      <p className="font-semibold">Connection</p>
      <button type="button" aria-label="Close connection details" className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={onClose}><X className="size-3.5" /></button>
    </div>
    <form className="mt-2 flex items-end gap-2" onSubmit={event => { event.preventDefault(); mcp.rename(draft) }}>
      <label className="min-w-0 flex-1">Name your agent sees
        <input aria-label="Connection name" className="mt-1 w-full rounded border border-border bg-background px-2 py-1" value={draft} onChange={event => setDraft(event.target.value)} />
      </label>
      <button type="submit" className="rounded border border-border px-2 py-1 hover:bg-accent disabled:opacity-50" disabled={!trimmed || [...trimmed].length > 80 || trimmed === mcp.name}>Rename</button>
    </form>
    {connection && <div className="mt-3 space-y-1 break-words">
      <p className="flex items-center gap-1">Connection ID <code className="select-all font-mono text-muted-foreground">{connection.id}</code>
        <button type="button" aria-label="Copy connection ID" className="rounded p-0.5 hover:bg-accent" onClick={() => {
          void navigator.clipboard.writeText(connection.id).then(() => setCopied(true), () => {})
        }}>{copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}</button></p>
      {connection.owner ? <p>Agent ID <code className="select-all font-mono text-muted-foreground">{connection.owner.id}</code></p>
        : <p className="text-muted-foreground">No agent has selected this connection yet.</p>}
    </div>}
    <p className="mt-3 text-muted-foreground">Tool output, player names and encounter data from this tab are sent to your local agent.</p>
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
