import { AG_UI_EVENT_TYPES, type AgUiEvent, type AgUiEventType, type ClientToolRequestEvent } from "./protocol";
import type { InferenceRuntimeClient } from "./runtime";

export interface SseEvent {
  data: string;
  event?: string;
  id?: string;
}

export type AgUiClientErrorKind = "http" | "stream" | "parse" | "aborted";

export class AgUiClientError extends Error {
  readonly kind: AgUiClientErrorKind;
  readonly status?: number;
  readonly event?: SseEvent;

  constructor(
    kind: AgUiClientErrorKind,
    message: string,
    options: { cause?: unknown; status?: number; event?: SseEvent } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AgUiClientError";
    this.kind = kind;
    this.status = options.status;
    this.event = options.event;
  }
}

export interface RunAgUiOptions {
  url: string;
  body: unknown;
  signal?: AbortSignal;
  headers?: HeadersInit;
  fetch?: typeof fetch;
  runtime?: InferenceRuntimeClient;
  onEvent: (event: AgUiEvent, transportEvent: SseEvent) => void;
}

const AG_UI_EVENT_TYPE_SET = new Set<string>(AG_UI_EVENT_TYPES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(
  value: Record<string, unknown>,
  field: string,
  event: SseEvent,
): string {
  const result = value[field];
  if (typeof result !== "string") {
    throw new AgUiClientError("parse", `AG-UI event is missing string field "${field}".`, { event });
  }
  return result;
}

function requireNumber(
  value: Record<string, unknown>,
  field: string,
  event: SseEvent,
): number {
  const result = value[field];
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new AgUiClientError("parse", `AG-UI event is missing finite number field "${field}".`, { event });
  }
  return result;
}

function requireArray(
  value: Record<string, unknown>,
  field: string,
  event: SseEvent,
): unknown[] {
  const result = value[field];
  if (!Array.isArray(result)) {
    throw new AgUiClientError("parse", `AG-UI event is missing array field "${field}".`, { event });
  }
  return result;
}

const DEBUG_PHASES = new Set(["request", "tool_results", "response"]);
const DEBUG_PERSISTENCE = new Set(["ephemeral", "durable"]);

function requireRecord(value: unknown, field: string, event: SseEvent): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new AgUiClientError("parse", `AG-UI event is missing object field "${field}".`, { event });
  }
  return value;
}

function requireOptionalString(value: Record<string, unknown>, field: string, event: SseEvent): void {
  if (value[field] !== undefined && typeof value[field] !== "string") {
    throw new AgUiClientError("parse", `AG-UI field "${field}" must be a string.`, { event });
  }
}

function validateDebugSnapshot(value: Record<string, unknown>, event: SseEvent): void {
  requireString(value, "runId", event);
  const iteration = requireNumber(value, "iteration", event);
  if (!Number.isInteger(iteration) || iteration < 1) {
    throw new AgUiClientError("parse", "DEBUG_SNAPSHOT iteration must be a positive integer.", { event });
  }
  const phase = requireString(value, "phase", event);
  if (!DEBUG_PHASES.has(phase)) {
    throw new AgUiClientError("parse", "DEBUG_SNAPSHOT has an unsupported phase.", { event });
  }
  requireString(value, "assistantId", event);
  requireString(value, "model", event);
  const persistence = requireString(value, "persistence", event);
  if (!DEBUG_PERSISTENCE.has(persistence)) {
    throw new AgUiClientError("parse", "DEBUG_SNAPSHOT has an unsupported persistence mode.", { event });
  }
  requireOptionalString(value, "contextType", event);
  requireOptionalString(value, "contextId", event);

  for (const item of requireArray(value, "messages", event)) {
    const message = requireRecord(item, "messages[]", event);
    requireString(message, "role", event);
    requireString(message, "content", event);
    requireOptionalString(message, "name", event);
    requireOptionalString(message, "toolCallId", event);
    if (message.toolCalls !== undefined) {
      if (!Array.isArray(message.toolCalls)) {
        throw new AgUiClientError("parse", 'AG-UI field "toolCalls" must be an array.', { event });
      }
      for (const item of message.toolCalls) {
        const toolCall = requireRecord(item, "toolCalls[]", event);
        requireString(toolCall, "id", event);
        requireString(toolCall, "name", event);
        requireString(toolCall, "arguments", event);
      }
    }
  }

  for (const item of requireArray(value, "tools", event)) {
    const tool = requireRecord(item, "tools[]", event);
    requireString(tool, "name", event);
    requireString(tool, "description", event);
    if (!("parameters" in tool)) {
      throw new AgUiClientError("parse", 'AG-UI debug tool is missing field "parameters".', { event });
    }
  }

  for (const item of requireArray(value, "skills", event)) {
    const skill = requireRecord(item, "skills[]", event);
    requireString(skill, "id", event);
    requireString(skill, "name", event);
    for (const field of ["version", "source", "promptContribution"]) {
      requireOptionalString(skill, field, event);
    }
    if (skill.tools !== undefined && (!Array.isArray(skill.tools) || skill.tools.some((tool) => typeof tool !== "string"))) {
      throw new AgUiClientError("parse", 'AG-UI debug skill field "tools" must be a string array.', { event });
    }
  }

  const limits = requireRecord(value.limits, "limits", event);
  for (const field of ["maxHistoryMessages", "maxHistoryBytes", "maxIterations", "maxToolCalls", "maxToolArguments", "maxToolOutput", "maxAssistantText"]) {
    requireNumber(limits, field, event);
  }
  const usage = requireRecord(value.usage, "usage", event);
  for (const field of ["promptTokens", "completionTokens", "totalTokens"]) {
    requireNumber(usage, field, event);
  }
}

const CLIENT_TOOL_EFFECTS = new Set(["read", "view_mutation"]);
const CLIENT_TOOL_CONFIRMATIONS = new Set(["never", "unless_yolo"]);

function validateClientToolRequest(value: Record<string, unknown>, event: SseEvent): void {
  for (const field of ["runId", "threadId", "toolCallId", "toolName", "arguments"]) {
    requireString(value, field, event);
  }
  requireOptionalString(value, "clientSessionId", event);
  const effect = requireString(value, "effect", event);
  if (!CLIENT_TOOL_EFFECTS.has(effect)) {
    throw new AgUiClientError("parse", "CLIENT_TOOL_REQUEST has an unsupported effect.", { event });
  }
  const confirmation = requireString(value, "confirmation", event);
  if (!CLIENT_TOOL_CONFIRMATIONS.has(confirmation)) {
    throw new AgUiClientError("parse", "CLIENT_TOOL_REQUEST has an unsupported confirmation policy.", { event });
  }
  const capability = requireRecord(value.capability, "capability", event);
  requireString(capability, "id", event);
  const version = requireNumber(capability, "version", event);
  if (!Number.isInteger(version) || version < 1) {
    throw new AgUiClientError("parse", "CLIENT_TOOL_REQUEST capability version must be a positive integer.", { event });
  }
  for (const field of ["scopeType", "scopeId"]) {
    requireOptionalString(capability, field, event);
  }
  if (capability.stateRevision !== undefined) {
    const stateRevision = requireNumber(capability, "stateRevision", event);
    if (!Number.isInteger(stateRevision) || stateRevision < 0) {
      throw new AgUiClientError("parse", "CLIENT_TOOL_REQUEST state revision must be a nonnegative integer.", { event });
    }
  }
  if ((capability.scopeType === undefined) !== (capability.scopeId === undefined)) {
    throw new AgUiClientError("parse", "CLIENT_TOOL_REQUEST capability scope must include type and id.", { event });
  }
}

function validateAgUiEvent(value: unknown, transportEvent: SseEvent): AgUiEvent {
  if (!isRecord(value)) {
    throw new AgUiClientError("parse", "AG-UI event data must be a JSON object.", {
      event: transportEvent,
    });
  }

  const type = value.type ?? transportEvent.event;
  if (typeof type !== "string" || !AG_UI_EVENT_TYPE_SET.has(type)) {
    throw new AgUiClientError("parse", `Unsupported or missing AG-UI event type: ${String(type)}.`, {
      event: transportEvent,
    });
  }

  const withTransportType = value.type === undefined ? { ...value, type } : value;
  switch (type as AgUiEventType) {
    case "RUN_STARTED":
    case "RUN_FINISHED":
      requireString(withTransportType, "threadId", transportEvent);
      requireString(withTransportType, "runId", transportEvent);
      break;
    case "RUN_ERROR":
      requireString(withTransportType, "message", transportEvent);
      break;
    case "TEXT_MESSAGE_START":
      requireString(withTransportType, "messageId", transportEvent);
      if (withTransportType.role !== "assistant") {
        throw new AgUiClientError("parse", "TEXT_MESSAGE_START role must be " + '"assistant".', {
          event: transportEvent,
        });
      }
      break;
    case "TEXT_MESSAGE_CONTENT":
      requireString(withTransportType, "messageId", transportEvent);
      requireString(withTransportType, "delta", transportEvent);
      break;
    case "TEXT_MESSAGE_END":
      requireString(withTransportType, "messageId", transportEvent);
      break;
    case "TOOL_CALL_START":
      requireString(withTransportType, "toolCallId", transportEvent);
      requireString(withTransportType, "toolCallName", transportEvent);
      if (
        withTransportType.parentMessageId !== undefined &&
        typeof withTransportType.parentMessageId !== "string"
      ) {
        throw new AgUiClientError("parse", 'AG-UI field "parentMessageId" must be a string.', {
          event: transportEvent,
        });
      }
      break;
    case "TOOL_CALL_ARGS":
      requireString(withTransportType, "toolCallId", transportEvent);
      requireString(withTransportType, "delta", transportEvent);
      break;
    case "CLIENT_TOOL_REQUEST":
      validateClientToolRequest(withTransportType, transportEvent);
      break;
    case "DEBUG_SNAPSHOT":
      validateDebugSnapshot(withTransportType, transportEvent);
      break;
    case "TOOL_CALL_END":
      requireString(withTransportType, "toolCallId", transportEvent);
      break;
  }

  return withTransportType as unknown as AgUiEvent;
}

export function parseAgUiEvent(transportEvent: SseEvent): AgUiEvent {
  let value: unknown;
  try {
    value = JSON.parse(transportEvent.data);
  } catch (error) {
    throw new AgUiClientError("parse", "AG-UI event contains malformed JSON.", {
      cause: error,
      event: transportEvent,
    });
  }

  return validateAgUiEvent(value, transportEvent);
}

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines: string[] = [];
  let event: string | undefined;
  let lastEventId: string | undefined;

  const buildEvent = (): SseEvent | undefined => {
    if (dataLines.length === 0) {
      event = undefined;
      return undefined;
    }

    const parsed = { data: dataLines.join("\n"), event, id: lastEventId };
    dataLines = [];
    event = undefined;
    return parsed;
  };

  const processLine = (line: string): SseEvent | undefined => {
    if (line === "") {
      return buildEvent();
    }
    if (line.startsWith(":")) {
      return undefined;
    }

    const colonIndex = line.indexOf(":");
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex);
    let value = colonIndex === -1 ? "" : line.slice(colonIndex + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }

    switch (field) {
      case "data":
        dataLines.push(value);
        break;
      case "event":
        event = value;
        break;
      case "id":
        if (!value.includes("\0")) {
          lastEventId = value;
        }
        break;
    }
    return undefined;
  };

  const throwIfAborted = () => {
    if (signal?.aborted) {
      throw new AgUiClientError("aborted", "AG-UI run was cancelled.", { cause: signal.reason });
    }
  };
  const cancelReader = () => {
    void reader.cancel(signal?.reason).catch(() => undefined);
  };
  signal?.addEventListener("abort", cancelReader, { once: true });

  try {
    while (true) {
      throwIfAborted();
      const { done, value } = await reader.read();
      throwIfAborted();
      buffer += decoder.decode(value, { stream: !done });

      let lineEnd = buffer.search(/[\r\n]/);
      while (lineEnd !== -1) {
        if (buffer[lineEnd] === "\r" && lineEnd === buffer.length - 1 && !done) {
          break;
        }

        const line = buffer.slice(0, lineEnd);
        const newlineLength = buffer[lineEnd] === "\r" && buffer[lineEnd + 1] === "\n" ? 2 : 1;
        buffer = buffer.slice(lineEnd + newlineLength);
        const parsed = processLine(line);
        if (parsed) {
          yield parsed;
        }
        lineEnd = buffer.search(/[\r\n]/);
      }

      if (done) {
        if (buffer.length > 0) {
          const parsed = processLine(buffer);
          if (parsed) {
            yield parsed;
          }
        }
        const parsed = buildEvent();
        if (parsed) {
          yield parsed;
        }
        return;
      }
    }
  } catch (error) {
    if (error instanceof AgUiClientError) {
      throw error;
    }
    if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new AgUiClientError("aborted", "AG-UI run was cancelled.", { cause: error });
    }
    throw new AgUiClientError("stream", "Failed while reading the AG-UI event stream.", {
      cause: error,
    });
  } finally {
    signal?.removeEventListener("abort", cancelReader);
    reader.releaseLock();
  }
}

async function readResponseSnippet(response: Response, maxBytes = 500): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = "";
  let bytes = 0;
  try {
    while (bytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - bytes;
      const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      bytes += chunk.byteLength;
      result += decoder.decode(chunk, { stream: bytes < maxBytes });
      if (value.byteLength > remaining) break;
    }
    result += decoder.decode();
    return result.trim();
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function postSse(
  options: RunAgUiOptions,
  url: string,
  body: unknown,
): Promise<Response> {
  const fetchImplementation = options.fetch ?? fetch;
  const headers = new Headers(options.headers);
  headers.set("Accept", "text/event-stream");
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetchImplementation(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new AgUiClientError("aborted", "AG-UI run was cancelled.", { cause: error });
    }
    throw new AgUiClientError("stream", "Unable to continue the AG-UI run.", { cause: error });
  }

  if (!response.ok) {
    const detail = await readResponseSnippet(response);
    const suffix = detail ? `: ${detail}` : "";
    throw new AgUiClientError(
      "http",
      `AG-UI request failed with HTTP ${response.status}${suffix}`,
      { status: response.status },
    );
  }
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("text/event-stream")) {
    throw new AgUiClientError(
      "stream",
      `AG-UI response has unexpected Content-Type "${contentType || "missing"}".`,
    );
  }
  if (!response.body) throw new AgUiClientError("stream", "AG-UI response did not include a readable body.");
  return response;
}

async function consumeSegment(
  options: RunAgUiOptions,
  response: Response,
): Promise<"terminal" | ClientToolRequestEvent> {
  for await (const transportEvent of parseSseStream(response.body!, options.signal)) {
    const event = parseAgUiEvent(transportEvent);
    options.onEvent(event, transportEvent);
    if (event.type === "RUN_FINISHED" || event.type === "RUN_ERROR") return "terminal";
    if (event.type === "CLIENT_TOOL_REQUEST") return event;
  }
  throw new AgUiClientError(
    "stream",
    "AG-UI event stream ended before a terminal event or client tool request was received.",
  );
}

export async function runAgUi(options: RunAgUiOptions): Promise<void> {
  let response = await postSse(options, options.url, options.body);
  while (true) {
    const outcome = await consumeSegment(options, response);
    if (outcome === "terminal") return;
    if (!options.runtime) {
      throw new AgUiClientError("stream", "The run requested a client tool without an inference runtime.");
    }

    let continuation;
    try {
      continuation = await options.runtime.executeClientTool(
        outcome,
        options.signal ?? new AbortController().signal,
      );
    } catch (error) {
      if (options.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        throw new AgUiClientError("aborted", "AG-UI run was cancelled.", { cause: error });
      }
      throw new AgUiClientError("stream", "The client tool runtime failed.", { cause: error });
    }
    const continuationUrl = `/api/v1/inference/runs/${encodeURIComponent(outcome.runId)}/client-tools/${encodeURIComponent(outcome.toolCallId)}`;
    response = await postSse(options, continuationUrl, continuation);
  }
}
