import { loadPanelPackage, type PanelPackage } from "../Guides/package/panelLoader"
import type { PreviewRunResult } from "./previewRun"

// This address is intentionally not supplied by a URL or a module manifest.
export const MODULE_DEV_ORIGIN = "http://127.0.0.1:17643"
export const MAX_DEV_STATE_BYTES = 12 * 1024 * 1024
export type DevContext = { instanceId: string; encounterIds: readonly string[] }
type DevCommand = { id: string; type: "preview"; revision: string }
export type DevState = { revision: string; archive: string; error?: string; commands: DevCommand[] }

export function moduleDevToken(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("module-dev")
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null
}

export function parseDevState(value: unknown): DevState {
  if (!value || typeof value !== "object") throw new Error("Invalid module dev response")
  const data = value as Record<string, unknown>
  if (data.protocol !== 1 || typeof data.revision !== "string" || data.revision.length > 128 ||
    typeof data.archive !== "string" || data.archive.length > MAX_DEV_STATE_BYTES ||
    (data.error !== undefined && (typeof data.error !== "string" || data.error.length > 4096)) ||
    !Array.isArray(data.commands) || data.commands.length > 16) throw new Error("Invalid module dev response")
  const commands = data.commands.map((command: unknown) => {
    if (!command || typeof command !== "object") throw new Error("Invalid dev command")
    const item = command as Record<string, unknown>
    if (item.type !== "preview" || typeof item.id !== "string" || item.id.length > 128 ||
      typeof item.revision !== "string" || item.revision.length > 128) throw new Error("Invalid dev command")
    return { id: item.id, type: "preview" as const, revision: item.revision }
  })
  return { revision: data.revision, archive: data.archive, error: data.error as string | undefined, commands }
}

/** Bounded reads, including chunked responses without a Content-Length. */
export async function readDevJSON(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`Module dev server returned ${response.status}`)
  if (!response.body) throw new Error("Empty module dev response")
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_DEV_STATE_BYTES) throw new Error("Module dev response is too large")
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
}

export async function decodeDevPackage(archive: string): Promise<PanelPackage> {
  if (archive.length > MAX_DEV_STATE_BYTES) throw new Error("Module package is too large")
  const bytes = Uint8Array.from(atob(archive), char => char.charCodeAt(0))
  return loadPanelPackage(bytes)
}

interface BridgeOptions {
  token: string
  signal: AbortSignal
  context: () => DevContext
  onPackage: (panel: PanelPackage | null, revision: string, error?: string) => void
  preview: (panel: PanelPackage, context: DevContext, signal: AbortSignal) => Promise<PreviewRunResult>
  fetch?: typeof fetch
}

/** One explicitly approved tab. Heartbeats continue while MCP replays run. */
export async function connectModuleDev(options: BridgeOptions): Promise<void> {
  const { signal } = options
  const clientId = crypto.randomUUID()
  const fetcher = options.fetch ?? fetch
  const headers = { Authorization: `Bearer ${options.token}`, "Content-Type": "application/json", "X-Chronicle-Client": clientId }
  const request = (path: string, body?: unknown) => fetcher(`${MODULE_DEV_ORIGIN}/v1/${path}`, {
    method: body === undefined ? "GET" : "POST", headers, credentials: "omit", referrerPolicy: "no-referrer",
    cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }).then(readDevJSON)
  let revision: string | undefined
  let panel: PanelPackage | null = null
  let active: AbortController | undefined
  let result: { id: string; revision: string; result: unknown } | undefined
  const seen = new Set<string>()
  try {
    while (!signal.aborted) {
      const sent = result
      await request("browser", { clientId, context: options.context(), ...(sent && { result: sent }) })
      if (result === sent) result = undefined
      const state = parseDevState(await request("state"))
      if (state.revision !== revision) {
        active?.abort()
        revision = state.revision
        panel = null
        let error = state.error
        if (!error) {
          try { panel = await decodeDevPackage(state.archive) }
          catch (caught) { error = caught instanceof Error ? caught.message : "Invalid local package" }
        }
        signal.throwIfAborted()
        options.onPackage(panel, revision, error)
      }
      for (const command of state.commands) {
        if (seen.has(command.id)) continue
        // The server permits one pending MCP preview. Never let a second command replace its result.
        if ((active && !active.signal.aborted) || result) break
        seen.add(command.id)
        if (seen.size > 256) seen.delete(seen.values().next().value!)
        const run = new AbortController()
        active = run
        const context = options.context()
        const invalid = command.revision !== revision ? "Source changed; retry preview" : !panel ? state.error ?? "Invalid local package" : ""
        const pending = invalid ? Promise.resolve({ ok: false, error: invalid })
          : Promise.resolve().then(() => options.preview(panel!, context, AbortSignal.any([signal, run.signal, AbortSignal.timeout(55_000)])))
        void pending.catch(error => ({ ok: false, error: error instanceof Error ? error.message : "Preview failed" }))
          .then(value => {
            if (!signal.aborted) result = { id: command.id, revision: command.revision, result: { ...value, context } }
            run.abort()
          })
      }
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(signal.reason) }
        const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve() }, 750)
        signal.addEventListener("abort", abort, { once: true })
        if (signal.aborted) abort()
      })
    }
  } finally { active?.abort() }
}
