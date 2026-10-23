import { describe, expect, it, vi } from "vitest";
import { AgUiClientError, parseAgUiEvent, parseSseStream, runAgUi } from "./client";
import type { AgUiEvent } from "./protocol";

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const events = [];
  for await (const event of parseSseStream(stream)) {
    events.push(event);
  }
  return events;
}

describe("parseSseStream", () => {
  it("frames events across arbitrary chunks and preserves event and id fields", async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(
      'id: event-7\r\nevent: TEXT_MESSAGE_CONTENT\r\ndata: {"messageId":"m1",\r\ndata: "delta":"hi"}\r\n\r\n',
    );
    const chunks = [bytes.slice(0, 1), bytes.slice(1, 17), bytes.slice(17, 49), bytes.slice(49)];

    await expect(collect(streamFromChunks(chunks))).resolves.toEqual([
      {
        id: "event-7",
        event: "TEXT_MESSAGE_CONTENT",
        data: '{"messageId":"m1",\n"delta":"hi"}',
      },
    ]);
  });

  it("decodes UTF-8 characters split across byte chunks", async () => {
    const bytes = new TextEncoder().encode('data: {"type":"RUN_ERROR","message":"café 🐢"}\n\n');
    const emojiStart = bytes.findIndex((byte) => byte === 0xf0);
    const chunks = [bytes.slice(0, emojiStart + 1), bytes.slice(emojiStart + 1, emojiStart + 3), bytes.slice(emojiStart + 3)];

    const [event] = await collect(streamFromChunks(chunks));
    expect(parseAgUiEvent(event)).toMatchObject({ type: "RUN_ERROR", message: "café 🐢" });
  });

  it("cancels a pending stream read when its signal is aborted", async () => {
    const abortController = new AbortController();
    const stream = new ReadableStream<Uint8Array>({ pull: () => new Promise(() => undefined) });
    const pendingEvent = parseSseStream(stream, abortController.signal).next();

    abortController.abort("cancelled by test");
    await expect(pendingEvent).rejects.toMatchObject({ kind: "aborted" });
  });
});

describe("parseAgUiEvent", () => {
  it("uses the SSE event field when the JSON payload omits type", () => {
    expect(
      parseAgUiEvent({
        event: "TEXT_MESSAGE_END",
        id: "transport-id",
        data: '{"messageId":"message-1"}',
      }),
    ).toEqual({ type: "TEXT_MESSAGE_END", messageId: "message-1" });
  });

  it("validates and returns a complete debug snapshot", () => {
    const snapshot = {
      type: "DEBUG_SNAPSHOT",
      runId: "run-1",
      iteration: 1,
      phase: "request",
      assistantId: "site-help",
      model: "provider/model",
      persistence: "ephemeral",
      messages: [{ role: "system", content: "instructions", toolCalls: [{ id: "call-1", name: "lookup", arguments: "{}" }] }],
      tools: [{ name: "lookup", description: "Look up data", parameters: { type: "object" } }],
      skills: [],
      limits: {
        maxHistoryMessages: 50,
        maxHistoryBytes: 262144,
        maxIterations: 5,
        maxToolCalls: 10,
        maxToolArguments: 16384,
        maxToolOutput: 65536,
        maxAssistantText: 262144,
      },
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    };

    expect(parseAgUiEvent({ data: JSON.stringify(snapshot) })).toEqual(snapshot);
  });

  it("rejects malformed nested debug snapshot data", () => {
    const base = {
      type: "DEBUG_SNAPSHOT",
      runId: "run-1",
      iteration: 1,
      phase: "request",
      assistantId: "site-help",
      model: "provider/model",
      persistence: "ephemeral",
      messages: [{ role: "system", content: "instructions" }],
      tools: [],
      skills: [],
      limits: {
        maxHistoryMessages: 50,
        maxHistoryBytes: 262144,
        maxIterations: 5,
        maxToolCalls: 10,
        maxToolArguments: 16384,
        maxToolOutput: 65536,
        maxAssistantText: 262144,
      },
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    };

    expect(() => parseAgUiEvent({ data: JSON.stringify({ ...base, iteration: 1.5 }) })).toThrowError(
      expect.objectContaining<Partial<AgUiClientError>>({ kind: "parse" }),
    );
    expect(() => parseAgUiEvent({ data: JSON.stringify({ ...base, messages: [{ role: "system", content: 42 }] }) })).toThrowError(
      expect.objectContaining<Partial<AgUiClientError>>({ kind: "parse" }),
    );
    expect(() => parseAgUiEvent({ data: JSON.stringify({ ...base, usage: { promptTokens: "secret" } }) })).toThrowError(
      expect.objectContaining<Partial<AgUiClientError>>({ kind: "parse" }),
    );
  });

  it("reports malformed JSON as a typed parse error", () => {
    expect(() => parseAgUiEvent({ data: "{" })).toThrowError(
      expect.objectContaining<Partial<AgUiClientError>>({ kind: "parse" }),
    );
  });
});

describe("runAgUi", () => {
  it("posts JSON, requests SSE, and emits parsed events", async () => {
    const events: AgUiEvent[] = [];
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        'data: {"type":"RUN_STARTED","threadId":"t1","runId":"r1"}\n\n' +
          'data: {"type":"RUN_FINISHED","threadId":"t1","runId":"r1"}\n\n',
        { headers: { "Content-Type": "text/event-stream; charset=utf-8" } },
      ),
    );

    await runAgUi({
      url: "/api/assistant",
      body: { hello: "world" },
      fetch: fetchMock,
      onEvent: (event) => events.push(event),
    });

    expect(events.map((event) => event.type)).toEqual(["RUN_STARTED", "RUN_FINISHED"]);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe('{"hello":"world"}');
    expect(new Headers(init?.headers).get("Accept")).toBe("text/event-stream");
  });

  it("reports non-2xx responses as typed HTTP errors", async () => {
    const promise = runAgUi({
      url: "/api/assistant",
      body: {},
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response("provider unavailable", { status: 503 })),
      onEvent: () => undefined,
    });

    await expect(promise).rejects.toMatchObject({ kind: "http", status: 503 });
  });

  it("bounds non-2xx response details while reading", async () => {
    const promise = runAgUi({
      url: "/api/assistant",
      body: {},
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response("x".repeat(50_000), { status: 502 })),
      onEvent: () => undefined,
    });

    await expect(promise).rejects.toSatisfy((error: unknown) =>
      error instanceof AgUiClientError && error.kind === "http" && error.message.length < 600
    );
  });

  it("reports a stream that ends without a terminal run event", async () => {
    const promise = runAgUi({
      url: "/api/assistant",
      body: {},
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response('data: {"type":"RUN_STARTED","threadId":"t1","runId":"r1"}\n\n', {
          headers: { "Content-Type": "text/event-stream" },
        }),
      ),
      onEvent: () => undefined,
    });

    await expect(promise).rejects.toMatchObject({ kind: "stream" });
  });

  it("turns AbortSignal cancellation into a typed abort error", async () => {
    const abortController = new AbortController();
    const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const promise = runAgUi({
      url: "/api/assistant",
      body: {},
      fetch: fetchMock,
      signal: abortController.signal,
      onEvent: () => undefined,
    });

    abortController.abort();
    await expect(promise).rejects.toMatchObject({ kind: "aborted" });
  });
});

describe("client tool continuation", () => {
  const clientRequest = {
    type: "CLIENT_TOOL_REQUEST",
    runId: "run-1",
    threadId: "thread-1",
    toolCallId: "call-1",
    toolName: "inspect",
    arguments: {},
    clientSessionId: "session-1",
    capability: { id: "page", version: 1, scopeType: "route", scopeId: "rankings", stateRevision: 4 },
    effect: "read",
    confirmation: "never",
  } as const;

  it("validates client request fields and rejects malformed policies", () => {
    expect(parseAgUiEvent({ data: JSON.stringify(clientRequest) })).toEqual(clientRequest);
    expect(() => parseAgUiEvent({ data: JSON.stringify({ ...clientRequest, effect: "write" }) }))
      .toThrowError(expect.objectContaining<Partial<AgUiClientError>>({ kind: "parse" }));
    const missingArguments: Record<string, unknown> = { ...clientRequest };
    delete missingArguments.arguments;
    expect(() => parseAgUiEvent({ data: JSON.stringify(missingArguments) }))
      .toThrowError(expect.objectContaining<Partial<AgUiClientError>>({ kind: "parse" }));
    expect(() => parseAgUiEvent({ data: JSON.stringify({ ...clientRequest, capability: { id: "page", version: 1, scopeType: "route" } }) }))
      .toThrowError(expect.objectContaining<Partial<AgUiClientError>>({ kind: "parse" }));
  });

  it("executes a client tool and consumes the continuation SSE segment", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(
        `data: ${JSON.stringify(clientRequest)}\n\n`,
        { headers: { "Content-Type": "text/event-stream" } },
      ))
      .mockResolvedValueOnce(new Response(
        'data: {"type":"TOOL_CALL_END","toolCallId":"call-1"}\n\n' +
        'data: {"type":"RUN_FINISHED","threadId":"thread-1","runId":"run-1"}\n\n',
        { headers: { "Content-Type": "text/event-stream" } },
      ));
    const executeClientTool = vi.fn(async () => ({
      client_session_id: "session-1",
      capability_id: "page",
      capability_version: 1,
      scope_type: "route",
      scope_id: "rankings",
      state_revision: 4,
      status: "success" as const,
      result: { ok: true },
    }));
    const events: AgUiEvent[] = [];

    await runAgUi({
      url: "/api/v1/inference/runs",
      body: { run_id: "run-1" },
      fetch: fetchMock,
      runtime: { getClientDescriptor: () => ({ session_id: "session-1", capabilities: [] }), executeClientTool },
      onEvent: (event) => events.push(event),
    });

    expect(executeClientTool).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/inference/runs/run-1/client-tools/call-1");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
      client_session_id: "session-1",
      status: "success",
      result: { ok: true },
    });
    expect(events.map((event) => event.type)).toEqual(["CLIENT_TOOL_REQUEST", "TOOL_CALL_END", "RUN_FINISHED"]);
  });

  it("preserves one abort signal across tool execution and continuation", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      `data: ${JSON.stringify(clientRequest)}\n\n`,
      { headers: { "Content-Type": "text/event-stream" } },
    ));
    const promise = runAgUi({
      url: "/api/v1/inference/runs",
      body: {},
      signal: controller.signal,
      fetch: fetchMock,
      runtime: {
        getClientDescriptor: () => ({ session_id: "session-1", capabilities: [] }),
        executeClientTool: (_request, signal) => new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
      },
      onEvent: () => undefined,
    });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ kind: "aborted" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
