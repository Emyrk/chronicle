import { describe, expect, it } from "vitest";
import { chatReducer, createInitialChatState, type AgUiEvent, type ChatState } from "./protocol";
import { EMPTY_USAGE, turnUsageByMessage } from "./usage";

function apply(state: ChatState, event: AgUiEvent): ChatState {
  return chatReducer(state, { type: "apply_event", event });
}

describe("chatReducer", () => {
  it("streams an assistant text message through its lifecycle", () => {
    let state = createInitialChatState([
      { id: "user-1", role: "user", content: "What happened?" },
    ]);
    state = apply(state, { type: "RUN_STARTED", threadId: "thread-1", runId: "run-1" });
    state = apply(state, { type: "TEXT_MESSAGE_START", messageId: "assistant-1", role: "assistant" });
    state = apply(state, { type: "TEXT_MESSAGE_CONTENT", messageId: "assistant-1", delta: "Ragnaros " });
    state = apply(state, { type: "TEXT_MESSAGE_CONTENT", messageId: "assistant-1", delta: "was defeated." });
    state = apply(state, { type: "TEXT_MESSAGE_END", messageId: "assistant-1" });
    state = apply(state, { type: "RUN_FINISHED", threadId: "thread-1", runId: "run-1" });

    expect(state.status).toBe("finished");
    expect(state.messages[1]).toMatchObject({
      id: "assistant-1",
      role: "assistant",
      content: "Ragnaros was defeated.",
      streaming: false,
    });
  });

  it("attaches streamed tool calls to their parent assistant message", () => {
    let state = createInitialChatState();
    state = apply(state, { type: "TEXT_MESSAGE_START", messageId: "assistant-1", role: "assistant" });
    state = apply(state, {
      type: "TOOL_CALL_START",
      toolCallId: "tool-1",
      toolCallName: "inspect_encounter",
      parentMessageId: "assistant-1",
    });
    state = apply(state, { type: "TOOL_CALL_ARGS", toolCallId: "tool-1", delta: '{"encounter' });
    state = apply(state, { type: "TOOL_CALL_ARGS", toolCallId: "tool-1", delta: 'Id":"e1"}' });
    state = apply(state, { type: "TOOL_CALL_END", toolCallId: "tool-1" });

    expect(state.messages[0].toolCalls).toEqual([
      {
        id: "tool-1",
        name: "inspect_encounter",
        arguments: '{"encounterId":"e1"}',
        status: "complete",
      },
    ]);
  });

  it("marks partial messages and tool calls interrupted when a run fails", () => {
    let state = createInitialChatState();
    state = apply(state, { type: "TEXT_MESSAGE_START", messageId: "assistant-1", role: "assistant" });
    state = apply(state, { type: "TEXT_MESSAGE_CONTENT", messageId: "assistant-1", delta: "Partial" });
    state = apply(state, {
      type: "TOOL_CALL_START",
      toolCallId: "tool-1",
      toolCallName: "lookup",
      parentMessageId: "assistant-1",
    });
    state = apply(state, { type: "RUN_ERROR", message: "Disconnected" });

    expect(state.messages[0]).toMatchObject({ streaming: false, interrupted: true });
    expect(state.messages[0].toolCalls?.[0].status).toBe("interrupted");
  });

  it("collects debug snapshots for the active run and resets them on the next run", () => {
    let state = createInitialChatState();
    state = apply(state, { type: "RUN_STARTED", threadId: "thread-1", runId: "run-1" });
    state = apply(state, {
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
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });
    expect(state.debugSnapshots).toHaveLength(1);
    expect(state.debugSnapshots[0].messages[0].content).toBe("instructions");

    state = apply(state, { type: "RUN_STARTED", threadId: "thread-1", runId: "run-1" });
    expect(state.debugSnapshots).toHaveLength(1);

    state = apply(state, { type: "RUN_STARTED", threadId: "thread-1", runId: "run-2" });
    expect(state.debugSnapshots).toEqual([]);
  });

  it("shows a provider-free debug preview without entering a running state", () => {
    const snapshot = {
      type: "DEBUG_SNAPSHOT" as const,
      runId: "preview-1",
      iteration: 0,
      phase: "request" as const,
      assistantId: "instance-analyst",
      model: "provider/model",
      persistence: "durable" as const,
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
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
    const state = chatReducer(createInitialChatState(), {
      type: "debug_preview",
      snapshot,
      message: { id: "debug-1", role: "assistant", content: "Preview ready." },
    });
    expect(state).toMatchObject({
      status: "idle",
      runId: "preview-1",
      messages: [{ content: "Preview ready." }],
      debugSnapshots: [snapshot],
    });
  });

  it("resets messages and run diagnostics for a new chat", () => {
    const state = chatReducer({
      ...createInitialChatState([{ id: "message-1", role: "user", content: "hello" }]),
      runId: "run-1",
      threadId: "thread-1",
      status: "error",
      error: "failed",
      clientToolRequests: [{
        type: "CLIENT_TOOL_REQUEST",
        runId: "run-1",
        threadId: "thread-1",
        toolCallId: "call-1",
        toolName: "inspect_instance_ui",
        arguments: {},
        capability: { id: "instance-page", version: 1 },
        effect: "read",
        confirmation: "never",
      }],
    }, { type: "reset_conversation" });

    expect(state).toEqual({
      messages: [],
      debugSnapshots: [],
      clientToolRequests: [],
      status: "idle",
      usageTotal: EMPTY_USAGE,
    });
  });

  it("surfaces protocol run errors", () => {
    const state = apply(createInitialChatState(), {
      type: "RUN_ERROR",
      message: "Provider disconnected",
      code: "provider_error",
    });

    expect(state).toMatchObject({ status: "error", error: "Provider disconnected" });
  });
});

it("keeps a client tool request pending until the server emits TOOL_CALL_END", () => {
  let state = createInitialChatState([{ id: "assistant-1", role: "assistant", content: "", streaming: true }]);
  state = apply(state, {
    type: "CLIENT_TOOL_REQUEST",
    runId: "run-1",
    threadId: "thread-1",
    toolCallId: "tool-1",
    toolName: "change_view",
    arguments: { tab: "damage" },
    capability: { id: "page", version: 1 },
    effect: "view_mutation",
    confirmation: "unless_yolo",
  });
  expect(state.clientToolRequests).toHaveLength(1);
  expect(state.messages[0].toolCalls?.[0]).toMatchObject({ status: "streaming", arguments: '{"tab":"damage"}' });
  state = apply(state, { type: "TOOL_CALL_END", toolCallId: "tool-1" });
  expect(state.messages[0].toolCalls?.[0].status).toBe("complete");
});

describe("chat usage", () => {
  it("attaches each call's usage to its message, or to the turn's latest reply, and keeps a chat total", () => {
    const stored = { promptTokens: 1000, completionTokens: 100, cachedTokens: 0, reasoningTokens: 0, costUsd: 0.01, calls: 2 };
    let state = createInitialChatState([{ id: "u0", role: "user", content: "earlier" }], stored);
    state = chatReducer(state, { type: "append_message", message: { id: "u1", role: "user", content: "build it" } });
    // A tool-only step arrives before any assistant message of this turn exists: it waits on the user message.
    state = apply(state, { type: "USAGE", runId: "r", messageId: "tool-step", usage: { promptTokens: 10, completionTokens: 1, totalTokens: 11, costUsd: 0.001 } });
    expect(state.messages.at(-1)?.usage?.promptTokens).toBe(10);
    state = apply(state, { type: "TEXT_MESSAGE_START", messageId: "a1", role: "assistant" });
    state = apply(state, { type: "USAGE", runId: "r", messageId: "a1", usage: { promptTokens: 20, completionTokens: 2, totalTokens: 22, cachedTokens: 5, costUsd: 0.002 } });
    // A later step without its own message joins the latest reply of the same turn.
    state = apply(state, { type: "USAGE", runId: "r", messageId: "missing", usage: { promptTokens: 30, completionTokens: 3, totalTokens: 33 } });
    expect(state.messages.at(-1)?.usage).toEqual({ promptTokens: 50, completionTokens: 5, cachedTokens: 5, reasoningTokens: 0, costUsd: 0.002, calls: 2 });
    expect(state.usageTotal.promptTokens).toBe(1060);
    expect(state.usageTotal.calls).toBe(5);
    expect(state.usageTotal.costUsd).toBeCloseTo(0.013);
    expect(turnUsageByMessage(state.messages, false).get("a1")).toMatchObject({ promptTokens: 60, calls: 3 });
    expect(chatReducer(state, { type: "reset_conversation" }).usageTotal).toEqual(EMPTY_USAGE);
  });
});
