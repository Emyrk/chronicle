import type { BrowserCommand, BrowserPage, BrowserTool } from "./browserTools"

export const LOCAL_MCP_ORIGIN = "http://127.0.0.1:17643"
const MAX_BYTES = 256 * 1024

export async function readBridgeJSON(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`Local MCP returned ${response.status}`)
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

export function parseBridgeCommands(value: unknown): BrowserCommand[] {
  if (!value || typeof value !== "object" || !("protocol" in value) || value.protocol !== 2 ||
    !("commands" in value) || !Array.isArray(value.commands) || value.commands.length > 16) throw new Error("Invalid MCP command response")
  return value.commands.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid MCP command")
    const command = item as BrowserCommand
    if (command.type !== "tool" || typeof command.id !== "string" || command.id.length > 128 ||
      typeof command.generation !== "string" || command.generation.length > 128 ||
      typeof command.toolName !== "string" || command.toolName.length > 64 ||
      !command.capability || typeof command.capability.id !== "string" || !Number.isSafeInteger(command.capability.version)) throw new Error("Invalid MCP command")
    return command
  })
}

interface BridgeOptions {
  signal: AbortSignal
  current: () => { page: BrowserPage; tools: BrowserTool[] }
  execute: (command: BrowserCommand, page: BrowserPage, tools: BrowserTool[], signal: AbortSignal) => Promise<unknown>
  connected: () => void
  fetch?: typeof fetch
}

export async function connectLocalMcp(options: BridgeOptions): Promise<void> {
  const { signal } = options
  const fetcher = options.fetch ?? fetch
  const clientId = crypto.randomUUID()
  let token = ""
  const request = (path: string, body?: unknown) => fetcher(`${LOCAL_MCP_ORIGIN}/v1/${path}`, {
    method: body === undefined ? "GET" : "POST", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store",
    headers: { "Content-Type": "application/json", "X-Chronicle-Client": clientId, ...(token && { Authorization: `Bearer ${token}` }) },
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]), ...(body !== undefined && { body: JSON.stringify(body) }),
  }).then(readBridgeJSON)
  const bootstrap = await request("connect", { protocol: 2 })
  if (!bootstrap || typeof bootstrap !== "object" || !("protocol" in bootstrap) || bootstrap.protocol !== 2 ||
    !("token" in bootstrap) || typeof bootstrap.token !== "string" || !/^[a-f0-9]{64}$/.test(bootstrap.token)) throw new Error("Unsupported local MCP handshake; update the local MCP package")
  token = bootstrap.token
  let active: { id: string; generation: string; abort: AbortController } | undefined
  let completed: { id: string; generation: string; result: unknown } | undefined
  const seen = new Set<string>()
  try {
    while (!signal.aborted) {
      const current = options.current()
      if (active && active.generation !== current.page.generation) active.abort.abort()
      const sent = completed
      await request("browser", { clientId, ...current, ...(sent && { result: sent }) })
      if (completed === sent) completed = undefined
      options.connected()
      const commands = parseBridgeCommands(await request("state"))
      // A canceled/timed-out MCP call disappears from the relay queue. Revoke its
      // browser execution too, especially an approval dialog that could still save.
      if (active && !commands.some(command => command.id === active!.id)) active.abort.abort()
      for (const command of commands) {
        if (seen.has(command.id) || active || completed) continue
        seen.add(command.id)
        if (seen.size > 256) seen.delete(seen.values().next().value!)
        const abort = new AbortController()
        const run = { id: command.id, generation: command.generation, abort }
        active = run
        void Promise.resolve().then(() => options.execute(command, current.page, current.tools,
          AbortSignal.any([signal, abort.signal, AbortSignal.timeout(55_000)])))
          .catch(error => ({ status: "client_error", result: { message: error instanceof Error ? error.message : "Browser tool failed" } }))
          .then(result => {
            const bounded = new TextEncoder().encode(JSON.stringify(result)).byteLength <= 64 * 1024
              ? result : { status: "client_error", result: { message: "Tool result exceeded the local MCP size limit" } }
            if (!signal.aborted) completed = { id: command.id, generation: command.generation, result: bounded }
            if (active === run) active = undefined
          })
      }
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(signal.reason) }
        const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve() }, 500)
        signal.addEventListener("abort", abort, { once: true })
        if (signal.aborted) abort()
      })
    }
  } finally { active?.abort.abort() }
}
