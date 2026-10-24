import { describe, expect, it } from "vitest";
import { chatReducer, createInitialChatState, type AgUiEvent, type ChatState } from "./protocol";

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
