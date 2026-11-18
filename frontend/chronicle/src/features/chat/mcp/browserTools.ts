import type { ClientToolCapability, ClientToolConfirmation, ClientToolEffect, ClientToolRequestEvent } from "../protocol"
import type { ClientToolContinuation, InferenceCapabilityDescriptor, InferenceRuntimeClient } from "../runtime"

export interface CatalogTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
  capability_id: string
  capability_version: number
  effect: ClientToolEffect
  confirmation: ClientToolConfirmation
}
export interface BrowserTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  capability: ClientToolCapability
  effect: ClientToolEffect
  confirmation: ClientToolConfirmation
}
export interface BrowserPage { url: string; generation: string; sessionId: string }
export interface BrowserCommand { id: string; type: "tool"; generation: string; toolName: string; arguments: unknown; capability: ClientToolCapability }

export function availableBrowserTools(catalog: readonly CatalogTool[], capabilities: readonly InferenceCapabilityDescriptor[]): BrowserTool[] {
  return catalog.flatMap(tool => {
    const capability = capabilities.find(value => value.id === tool.capability_id && value.version === tool.capability_version)
    if (!capability) return []
    return [{ name: tool.name, description: tool.description, inputSchema: tool.input_schema,
      effect: tool.effect, confirmation: tool.confirmation,
      capability: { id: capability.id, version: capability.version,
        ...(capability.scope_type && { scopeType: capability.scope_type }),
        ...(capability.scope_id && { scopeId: capability.scope_id }),
        ...(capability.state_revision !== undefined && { stateRevision: capability.state_revision }) },
    }]
  })
}

export function parseToolCatalog(value: unknown): CatalogTool[] {
  const tools = value && typeof value === "object" && "tools" in value ? value.tools : null
  if (!Array.isArray(tools) || tools.length > 64) throw new Error("Invalid Chronicle tool catalog")
  const names = new Set<string>()
  return tools.map((tool: unknown) => {
    if (!tool || typeof tool !== "object") throw new Error("Invalid Chronicle tool")
    const item = tool as Record<string, unknown>
    if (typeof item.name !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.name) || names.has(item.name) ||
      typeof item.description !== "string" || typeof item.capability_id !== "string" ||
      !Number.isSafeInteger(item.capability_version) ||
      (item.effect !== "read" && item.effect !== "view_mutation") ||
      (item.confirmation !== "never" && item.confirmation !== "unless_yolo") ||
      !item.input_schema || typeof item.input_schema !== "object" || Array.isArray(item.input_schema)) throw new Error("Invalid Chronicle tool")
    names.add(item.name)
    return item as unknown as CatalogTool
  })
}

export async function loadToolCatalog(signal: AbortSignal): Promise<CatalogTool[]> {
  const response = await fetch("/api/v1/inference/client-tools", { credentials: "same-origin", signal, cache: "no-store" })
  if (!response.ok) throw new Error(`Chronicle tool catalog unavailable (${response.status})`)
  return parseToolCatalog(await response.json())
}

export async function validateToolArguments(tool: BrowserTool, args: unknown, signal: AbortSignal): Promise<unknown> {
  const response = await fetch("/api/v1/inference/client-tools/validate", {
    method: "POST", credentials: "same-origin", signal, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: tool.name, capability_id: tool.capability.id, capability_version: tool.capability.version, arguments: args }),
  })
  if (!response.ok) throw new Error(`Chronicle rejected tool arguments (${response.status})`)
  const result = await response.json() as { arguments: unknown }
  return result.arguments
}

const sameCapability = (a: ClientToolCapability, b: ClientToolCapability) => a.id === b.id && a.version === b.version &&
  a.scopeType === b.scopeType && a.scopeId === b.scopeId && a.stateRevision === b.stateRevision

/** Effect and confirmation come only from the Chronicle catalog, never the relay request. */
export async function executeBrowserCommand(command: BrowserCommand, page: BrowserPage, tools: readonly BrowserTool[],
  runtime: InferenceRuntimeClient, currentPage: () => BrowserPage, signal: AbortSignal,
  validate = validateToolArguments): Promise<ClientToolContinuation> {
  const tool = tools.find(item => item.name === command.toolName && sameCapability(item.capability, command.capability))
  const stale = () => currentPage().generation !== page.generation || currentPage().sessionId !== page.sessionId || command.generation !== page.generation
  const failure = (message: string): ClientToolContinuation => ({ client_session_id: page.sessionId,
    capability_id: command.capability.id, capability_version: command.capability.version, status: "stale_state", result: { message } })
  if (stale() || !tool) return failure("Page or available tools changed; refresh before calling again")
  signal.throwIfAborted()
  const args = await validate(tool, command.arguments, signal)
  if (stale()) return failure("Page changed before tool execution")
  signal.throwIfAborted()
  const request: ClientToolRequestEvent = {
    type: "CLIENT_TOOL_REQUEST", runId: `local-mcp:${command.id}`, threadId: "local-mcp", toolCallId: command.id,
    toolName: tool.name, arguments: args, capability: tool.capability, clientSessionId: page.sessionId,
    effect: tool.effect, confirmation: tool.confirmation,
  }
  const result = await runtime.executeClientTool(request, signal, { yoloEnabled: false })
  return stale() ? failure("Page changed during tool execution") : result
}
