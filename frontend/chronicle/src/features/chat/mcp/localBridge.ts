import type { BrowserCommand, BrowserPage, BrowserTool } from "./browserTools"

export const LOCAL_MCP_ORIGIN = "http://127.0.0.1:17643"
const MAX_BYTES = 256 * 1024

export async function readBridgeJSON(response: Response): Promise<unknown> {
  if (!response.ok) throw new BridgeHTTPError(response.status)
  if (!response.body) throw new Error("Empty local MCP response")
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_BYTES) throw new Error("Local MCP response too large")
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
}

export interface BridgeConnection {
  id: string
  name: string
  page: BrowserPage
  owner: { id: string; name: string; version: string } | null
  ownershipRevision: number
}
class BridgeHTTPError extends Error {
  constructor(status: number) {
    super(`Local MCP returned ${status}. ${[401, 403, 404].includes(status) ? "Session expired or denied; disconnect and reconnect." : status === 409 ? "Connection conflict; reconnect with a new connection." : "Update the local MCP package and retry."}`)
  }
}
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.trim().length > 0 && [...value].length <= max
const revision = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value)
export function parseBridgeConnection(value: unknown): BridgeConnection {
  if (!record(value) || !text(value.id, 128) || !/^[\x21-\x7e]+$/.test(value.id) ||
    !text(value.name, 80) || value.name !== value.name.trim() || !revision(value.ownershipRevision) ||
    !record(value.page) || !text(value.page.url, 8192) || !text(value.page.generation, 128) || !text(value.page.sessionId, 128) ||
    (value.owner !== null && (!record(value.owner) || !text(value.owner.id, 128) || !/^[\x21-\x7e]+$/.test(value.owner.id) ||
      !text(value.owner.name, 128) || !text(value.owner.version, 128)))) throw new Error("Invalid local MCP connection metadata; update the local MCP package")
  return value as unknown as BridgeConnection
}
export function parseBridgeCommands(value: unknown): BrowserCommand[] {
  if (!record(value) || value.protocol !== 3) throw new Error("Unsupported local MCP protocol; update the local MCP package (protocol 3 required)")
  const connection = parseBridgeConnection(value.connection)
  if (!Array.isArray(value.commands) || value.commands.length > 1) throw new Error("Invalid MCP command response")
  return value.commands.map((item: unknown) => {
    if (!record(item)) throw new Error("Invalid MCP command")
    const command = item as unknown as BrowserCommand
    if (command.type !== "tool" || !text(command.id, 128) || !text(command.generation, 128) ||
      !text(command.toolName, 64) || !record(command.capability) || !text(command.capability.id, 128) ||
      !Number.isSafeInteger(command.capability.version) || !revision(command.ownershipRevision) ||
      command.ownershipRevision !== connection.ownershipRevision || !connection.owner) throw new Error("Invalid MCP command")
    return command
  })
}
interface BridgeOptions {
  signal: AbortSignal
  current: () => { page: BrowserPage; tools: BrowserTool[]; name: string }
  execute: (command: BrowserCommand, page: BrowserPage, tools: BrowserTool[], signal: AbortSignal) => Promise<unknown>
  connected: () => void
  changed?: (connection: BridgeConnection) => void
  status?: (status: "connected" | "reconnecting") => void
  busy?: (busy: boolean) => void
  controls?: (controls: { revoke: () => Promise<void> }) => void
  fetch?: typeof fetch
}
const pause = (signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const abort = () => { clearTimeout(timer); reject(signal.reason) }
  const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve() }, 500)
  signal.addEventListener("abort", abort, { once: true })
  if (signal.aborted) abort()
})

export async function connectLocalMcp(options: BridgeOptions): Promise<void> {
  const { signal } = options
  const fetcher = options.fetch ?? fetch
  const clientId = crypto.randomUUID()
  let token = ""
  const raw = (path: string, body?: unknown, independent = false) => fetcher(`${LOCAL_MCP_ORIGIN}/v1/${path}`, {
    method: body === undefined ? "GET" : "POST", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store",
    headers: { "Content-Type": "application/json", "X-Chronicle-Client": clientId, ...(token && { Authorization: `Bearer ${token}` }) },
    signal: independent ? AbortSignal.timeout(1500) : AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
  const request = (path: string, body?: unknown) => raw(path, body).then(readBridgeJSON)
  const bootstrap = await request("connect", { protocol: 3, clientId })
  if (!record(bootstrap) || bootstrap.protocol !== 3 || bootstrap.clientId !== clientId ||
    typeof bootstrap.token !== "string" || !/^[a-f0-9]{64}$/.test(bootstrap.token)) throw new Error("Unsupported local MCP handshake; update the local MCP package (protocol 3 required)")
  token = bootstrap.token
  let connection: BridgeConnection | undefined
  let active: { id: string; generation: string; abort: AbortController } | undefined
  let completed: { id: string; generation: string; ownershipRevision: number; result: unknown } | undefined
  // Never evict tombstones during this credential's lifetime: retained relay calls
  // must not execute again after a retry, cancellation, or ownership transition.
  const seen = new Set<string>()
  let epoch = 0
  let revoking = false
  let stopped = false
  let lastHeartbeat = Date.now()
  const cancel = () => { active?.abort.abort(); active = undefined; completed = undefined; options.busy?.(false) }
  const accept = (value: unknown): boolean => {
    const next = parseBridgeConnection(value)
    if (next.id !== clientId) throw new Error("Local MCP connection ID mismatch")
    if (connection && next.ownershipRevision < connection.ownershipRevision) return false
    if (connection && next.ownershipRevision === connection.ownershipRevision && JSON.stringify(next.owner) !== JSON.stringify(connection.owner)) throw new Error("Local MCP owner changed without a revision")
    if (connection && next.ownershipRevision !== connection.ownershipRevision) cancel()
    connection = next
    options.changed?.(next)
    return true
  }
  const metadata = (value: unknown) => {
    if (!record(value) || value.ok !== true || (value.resultAccepted !== undefined && typeof value.resultAccepted !== "boolean")) throw new Error("Invalid local MCP heartbeat response")
    return accept(value.connection)
  }
  options.controls?.({ revoke: async () => {
    if (!connection || signal.aborted || stopped || revoking) return
    const expectedOwnershipRevision = connection.ownershipRevision
    epoch++; revoking = true; cancel()
    try {
      const response = await raw("browser/revoke", { expectedOwnershipRevision })
      if (signal.aborted) return
      if (response.status === 409) {
        const value = await readBridgeJSON(new Response(response.body, { status: 200 }))
        if (!record(value)) throw new Error("Invalid local MCP revoke response")
        if (signal.aborted || stopped) return
        accept(value.connection)
        throw new Error("Control changed before revocation. Review the current owner before trying again.")
      }
      const value = await readBridgeJSON(response)
      if (!signal.aborted && !stopped) metadata(value)
    } finally { revoking = false }
  } })
  try {
    while (!signal.aborted) {
      try {
        const current = options.current()
        const name = current.name.trim()
        if (!text(name, 80)) throw new Error("Connection name must contain 1–80 Unicode characters")
        if (active && active.generation !== current.page.generation) cancel()
        if (completed && completed.generation !== current.page.generation) completed = undefined
        const sent = completed
        const fence = epoch
        const started = Date.now()
        const heartbeat = await request("browser", { clientId, ...current, name, ...(sent && { result: sent }) })
        if (signal.aborted) break
        if (fence !== epoch || revoking) { await pause(signal); continue }
        metadata(heartbeat)
        if (Date.now() - lastHeartbeat >= 10_000) throw new Error("Local MCP heartbeat lease expired; disconnect and reconnect")
        lastHeartbeat = started
        if (completed === sent) completed = undefined
        options.connected(); options.status?.("connected")
        const state = await request("state")
        if (signal.aborted) break
        if (fence !== epoch || revoking) { await pause(signal); continue }
        const commands = parseBridgeCommands(state)
        if (!accept((state as { connection: unknown }).connection)) { await pause(signal); continue }
        if (active && !commands.some(command => command.id === active!.id)) cancel()
        for (const command of commands) {
          if (seen.has(command.id) || active || completed) continue
          seen.add(command.id)
          const now = options.current().page
          if (!connection?.owner || connection.page.generation !== current.page.generation || connection.page.url !== current.page.url ||
            connection.page.sessionId !== current.page.sessionId || now.generation !== current.page.generation ||
            now.sessionId !== current.page.sessionId || command.generation !== now.generation) continue
          const abort = new AbortController()
          const run = { id: command.id, generation: command.generation, abort }
          const executionSignal = AbortSignal.any([signal, abort.signal, AbortSignal.timeout(55_000)])
          active = run; options.busy?.(true)
          void Promise.resolve().then(() => { executionSignal.throwIfAborted(); return options.execute(command, current.page, current.tools, executionSignal) })
            .catch(error => ({ status: "client_error", result: { message: error instanceof Error ? error.message : "Browser tool failed" } }))
            .then(result => {
              if (active !== run) return
              if (executionSignal.aborted || connection?.ownershipRevision !== command.ownershipRevision || options.current().page.generation !== command.generation) { cancel(); return }
              const bounded = new TextEncoder().encode(JSON.stringify(result)).byteLength <= 64 * 1024
                ? result : { status: "client_error", result: { message: "Tool result exceeded the local MCP size limit" } }
              completed = { id: command.id, generation: command.generation, ownershipRevision: command.ownershipRevision, result: bounded }
              active = undefined; options.busy?.(false)
            })
        }
      } catch (error) {
        cancel()
        if (signal.aborted) throw error
        const transient = error instanceof TypeError || (error instanceof DOMException && error.name === "TimeoutError")
        if (!transient || Date.now() - lastHeartbeat >= 10_000) throw error
        options.status?.("reconnecting")
      }
      await pause(signal)
      if (Date.now() - lastHeartbeat >= 10_000) throw new Error("Local MCP heartbeat lease expired; disconnect and reconnect")
    }
  } finally {
    stopped = true
    cancel()
    // Stop polling first. Cleanup uses its own short timeout, not the aborted
    // session signal, and never touches the browser working copy.
    const cleanup = raw("browser/disconnect", {}, true).catch(() => {})
    token = ""
    await cleanup
  }
}
