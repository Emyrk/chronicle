import type { PanelPackage } from "../Guides/package/panelLoader"
import { parseWorkerMessage } from "../Guides/protocol/protocol"
import { applySceneBatch, createInitialScene, UI_ROOT_ID } from "../Guides/protocol/scene"
import type { RetainedScene, SceneNode } from "../Guides/protocol/types"
import type { EventStreams } from "../Guides/runtime/panelEvents"
import type { PanelReplayMetrics } from "../Guides/runtime/panelWorker"
import type { PanelUnits } from "../Guides/runtime/panelUnits"
import { explainModuleError, formatModuleError, type ModulePhase } from "../Guides/runtime/moduleErrors"
import type { PanelReplayTime } from "../Instance/EventsPanels/LuaPanel/LuaPanelHost"
import { REPLAY_DISABLED_MESSAGE } from "../Instance/EventsPanels/LuaPanel/replayTime"

/** The parts of a Worker the runner uses, so tests can drive the worker handler directly. */
export interface PreviewWorker {
  postMessage(message: unknown): void
  terminate(): void
  onmessage: ((event: { data: unknown }) => void) | null
  onerror: ((event: unknown) => void) | null
}

export interface PreviewRunInput {
  panel: PanelPackage
  /** Bytes for every declared stream; see loadPreviewStreams. */
  streams?: EventStreams
  encounterIds: readonly string[]
  units?: PanelUnits
  /** Preview in Replay mode at this playhead; the panel must declare `replay`. */
  replay?: PanelReplayTime
}

export interface PreviewRunResult {
  ok: boolean
  /** The runtime's error, e.g. "main.lua:151: operation limit exceeded". */
  error?: string
  /** What the error means and how to fix it, the same explanation the preview pane shows. */
  explanation?: string
  metrics?: Pick<PanelReplayMetrics, "events" | "encounters" | "totalMs" | "luaMs" | "completeMs" | "uiOperations">
  /** Number of UI objects alive at the end. */
  nodes: number
  /** Indented outline of what the panel drew, for the assistant to read. */
  output: string
  truncated: boolean
}

const MAX_OUTPUT_LINES = 300
const MAX_OUTPUT_CHARS = 16_000
/** Same inactivity rule as the preview pane: long replays are fine while they keep making progress. */
const NO_PROGRESS_MS = 10_000

const round = (value: number) => Math.round(value * 10) / 10

function describeNode(node: SceneNode): string {
  const props = node.props
  const parts = [`${node.kind} "${node.id}"`]
  if (typeof props.text === "string") parts.push(JSON.stringify(props.text))
  if (props.visible === false) parts.push("(hidden)")
  if (typeof props.width === "number" && typeof props.height === "number") parts.push(`${props.width}x${props.height}`)
  if (typeof props.x === "number" && typeof props.y === "number") parts.push(`at ${props.x},${props.y}`)
  if (props.color !== undefined) parts.push(`color ${JSON.stringify(props.color)}`)
  if (props.backgroundColor !== undefined) parts.push(`background ${JSON.stringify(props.backgroundColor)}`)
  return parts.join(" ")
}

/** Text outline of the retained scene in parent/child order, bounded for tool output. */
export function describeScene(scene: RetainedScene): { output: string; truncated: boolean } {
  const children = new Map<string | null, SceneNode[]>()
  for (const node of scene.nodes.values()) {
    const parent = node.parentId === UI_ROOT_ID ? null : node.parentId
    children.set(parent, [...(children.get(parent) ?? []), node])
  }
  const lines: string[] = []
  let chars = 0
  let truncated = false
  const walk = (parent: string | null, depth: number) => {
    for (const node of children.get(parent) ?? []) {
      if (lines.length >= MAX_OUTPUT_LINES || chars >= MAX_OUTPUT_CHARS) { truncated = true; return }
      const line = `${"  ".repeat(depth)}${describeNode(node)}`
      lines.push(line)
      chars += line.length + 1
      walk(node.id, depth + 1)
    }
  }
  walk(null, 0)
  if (scene.chapter) lines.unshift(`chapter ${JSON.stringify(scene.chapter)}`)
  return { output: lines.join("\n") || "(the panel drew nothing)", truncated }
}

const defaultWorker = (): PreviewWorker => new Worker(new URL("../Guides/runtime/panelWorker.ts", import.meta.url), { type: "module" }) as unknown as PreviewWorker

/**
 * Replays the working copy in a fresh sandboxed worker, exactly like the preview pane, and collects
 * the result as text so the workshop assistant can read errors and output without the user pasting them.
 */
export function runPreview(input: PreviewRunInput, signal?: AbortSignal, createWorker: () => PreviewWorker = defaultWorker): Promise<PreviewRunResult> {
  const { panel, streams, encounterIds, units, replay } = input
  if (replay && !panel.replay) return Promise.resolve({ ok: false, error: REPLAY_DISABLED_MESSAGE, explanation: `Add "replay": "full" or "replay": "incremental" to project.json to preview Replay mode.`, nodes: 0, output: "", truncated: false })
  return new Promise((resolve, reject) => {
    let worker: PreviewWorker
    try { worker = createWorker() } catch { resolve({ ok: false, error: "This browser cannot start a Lua worker.", nodes: 0, output: "", truncated: false }); return }
    let scene = createInitialScene()
    let watchdog: ReturnType<typeof setTimeout> | undefined
    const replaying = panel.streams.length > 0 && !!streams && panel.streams.every(stream => streams[stream])
    const finish = (result: Omit<PreviewRunResult, "nodes" | "output" | "truncated"> | null) => {
      clearTimeout(watchdog)
      signal?.removeEventListener("abort", abort)
      worker.terminate()
      if (!result) { reject(signal?.reason ?? new DOMException("Aborted", "AbortError")); return }
      resolve({ ...result, nodes: scene.nodes.size, ...describeScene(scene) })
    }
    const armWatchdog = () => {
      clearTimeout(watchdog)
      watchdog = setTimeout(() => finish({ ok: false, error: `Panel worker made no progress for ${NO_PROGRESS_MS / 1000} seconds` }), NO_PROGRESS_MS)
    }
    const abort = () => finish(null)
    if (signal?.aborted) { finish(null); return }
    signal?.addEventListener("abort", abort, { once: true })
    worker.onmessage = ({ data }) => {
      const message = data as { type?: string; message?: unknown; metrics?: PanelReplayMetrics; phase?: ModulePhase; events?: number }
      if (message?.type === "error") {
        const error = String(message.message ?? "Panel failed")
        finish({ ok: false, error, explanation: formatModuleError(explainModuleError(error, { phase: message.phase, events: message.events })) })
        return
      }
      if (message?.type === "progress") { armWatchdog(); return }
      // The preview reports one snapshot; it never answers Chronicle.GetSpell, so names stay placeholders.
      if (message?.type === "spell-request") return
      if (message?.type === "replay-complete" || message?.type === "replay-paused") {
        const m = message.metrics
        finish({ ok: true, metrics: m && { events: m.events, encounters: m.encounters, totalMs: round(m.totalMs), luaMs: round(m.luaMs), completeMs: round(m.completeMs), uiOperations: m.uiOperations } })
        return
      }
      try {
        const parsed = parseWorkerMessage(data)
        if (parsed.type === "batch") scene = applySceneBatch(scene, parsed.operations)
        if (parsed.type === "ready") {
          const untilMs = replay && panel.replay === "incremental" ? replay.untilMs : undefined
          if (replaying) { armWatchdog(); worker.postMessage({ type: "streams", streams, encounterIds: [...encounterIds], untilMs, replayMs: replay?.ms ?? null }) }
          // Ready follows all startup batches, including when the panel draws nothing.
          else finish({ ok: true })
        }
      } catch (error) {
        finish({ ok: false, error: error instanceof Error ? error.message : "Invalid panel output" })
      }
    }
    worker.onerror = () => finish({ ok: false, error: "Lua worker failed to start." })
    armWatchdog()
    try {
      worker.postMessage({ type: "start", entrypoint: panel.entrypoint, sources: panel.sources, streams: panel.streams, streamScope: panel.streamScope, filterMode: panel.filterMode,
        maxEvents: panel.maxEvents, capabilities: panel.capabilities, units })
    } catch {
      finish({ ok: false, error: "Lua worker could not receive the source package." })
    }
  })
}

/** Mirrors the server's run_preview schema; the browser never trusts model arguments. */
export function parseRunPreviewArgs(value: unknown): { encounterIds?: string[]; replayMs?: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid run_preview arguments.")
  const input = value as Record<string, unknown>
  if (Object.keys(input).some(key => key !== "encounter_ids" && key !== "replay_ms")) throw new Error("run_preview only accepts encounter_ids and replay_ms.")
  const replayMs = input.replay_ms
  if (replayMs !== undefined && (typeof replayMs !== "number" || !Number.isFinite(replayMs) || replayMs < 0)) throw new Error("replay_ms must be a non-negative number of milliseconds.")
  const result: { encounterIds?: string[]; replayMs?: number } = replayMs === undefined ? {} : { replayMs }
  if (input.encounter_ids === undefined) return result
  const ids = input.encounter_ids
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => typeof id !== "string" || !id || id.length > 200) || new Set(ids).size !== ids.length) {
    throw new Error("encounter_ids must be 1 to 100 distinct encounter ids.")
  }
  return { ...result, encounterIds: ids as string[] }
}

/** Start and end (epoch ms) of the selected encounters, like the instance page's Replay bounds. */
export function selectionBounds(encounters: readonly { id: string; start_time: string; end_time: string }[], ids: readonly string[]): { startMs: number; endMs: number } | null {
  const selected = encounters.filter(encounter => ids.includes(encounter.id))
  if (!selected.length) return null
  const startMs = Math.min(...selected.map(encounter => new Date(encounter.start_time).getTime()))
  const endMs = Math.max(...selected.map(encounter => new Date(encounter.end_time).getTime()))
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs ? { startMs, endMs } : null
}
