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
