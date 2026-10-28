import { addUsage, EMPTY_USAGE, type ChatUsage } from "./usage";

export const AG_UI_EVENT_TYPES = [
  "RUN_STARTED",
  "RUN_FINISHED",
  "RUN_ERROR",
  "TEXT_MESSAGE_START",
  "TEXT_MESSAGE_CONTENT",
  "TEXT_MESSAGE_END",
  "TOOL_CALL_START",
  "TOOL_CALL_ARGS",
  "TOOL_CALL_END",
  "CLIENT_TOOL_REQUEST",
  "DEBUG_SNAPSHOT",
  "USAGE",
] as const;

export type AgUiEventType = (typeof AG_UI_EVENT_TYPES)[number];

interface AgUiEventBase {
  type: AgUiEventType;
  timestamp?: number;
  rawEvent?: unknown;
}

export interface RunStartedEvent extends AgUiEventBase {
  type: "RUN_STARTED";
  threadId: string;
  runId: string;
}

export interface RunFinishedEvent extends AgUiEventBase {
  type: "RUN_FINISHED";
  threadId: string;
  runId: string;
  result?: unknown;
}

export interface RunErrorEvent extends AgUiEventBase {
  type: "RUN_ERROR";
  message: string;
  code?: string;
}

export interface TextMessageStartEvent extends AgUiEventBase {
  type: "TEXT_MESSAGE_START";
  messageId: string;
  role: "assistant";
}

export interface TextMessageContentEvent extends AgUiEventBase {
  type: "TEXT_MESSAGE_CONTENT";
  messageId: string;
  delta: string;
}

export interface TextMessageEndEvent extends AgUiEventBase {
  type: "TEXT_MESSAGE_END";
  messageId: string;
}

export interface ToolCallStartEvent extends AgUiEventBase {
  type: "TOOL_CALL_START";
  toolCallId: string;
  toolCallName: string;
  parentMessageId?: string;
}

export interface ToolCallArgsEvent extends AgUiEventBase {
  type: "TOOL_CALL_ARGS";
  toolCallId: string;
  delta: string;
}

export interface ToolCallEndEvent extends AgUiEventBase {
  type: "TOOL_CALL_END";
  toolCallId: string;
}

export type ClientToolEffect = "read" | "view_mutation";
export type ClientToolConfirmation = "never" | "unless_yolo";

export interface ClientToolCapability {
  id: string;
  version: number;
  scopeType?: string;
  scopeId?: string;
  stateRevision?: number;
}

export interface ClientToolRequestEvent extends AgUiEventBase {
  type: "CLIENT_TOOL_REQUEST";
  runId: string;
  threadId: string;
  toolCallId: string;
  toolName: string;
  arguments: unknown;
  capability: ClientToolCapability;
  clientSessionId?: string;
  effect: ClientToolEffect;
  confirmation: ClientToolConfirmation;
}

export interface DebugToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface DebugMessage {
  role: string;
  name?: string;
  content: string;
  toolCallId?: string;
  toolCalls?: DebugToolCall[];
}

export interface DebugTool {
  name: string;
  description: string;
  parameters: unknown;
}

export interface DebugSkill {
  id: string;
  name: string;
  version?: string;
  source?: string;
  promptContribution?: string;
  tools?: string[];
}

export interface DebugLimits {
  maxHistoryMessages: number;
  maxHistoryBytes: number;
  maxIterations: number;
  maxToolCalls: number;
  maxToolArguments: number;
  maxToolOutput: number;
  maxAssistantText: number;
}

export interface DebugUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  /** OpenRouter credits (1 credit = 1 USD); absent when the provider reported no cost. */
  costUsd?: number;
}

/** Chronicle extension: usage for one model call, sent after that call's message and tool events. */
export interface UsageEvent extends AgUiEventBase {
  type: "USAGE";
  runId: string;
  messageId: string;
  usage: DebugUsage;
}

export interface DebugSnapshotEvent extends AgUiEventBase {
  type: "DEBUG_SNAPSHOT";
  runId: string;
  iteration: number;
  phase: "request" | "tool_results" | "client_tool_request" | "response";
  assistantId: string;
  model: string;
  persistence: "ephemeral" | "durable";
  contextType?: string;
  contextId?: string;
  messages: DebugMessage[];
  tools: DebugTool[];
  skills: DebugSkill[];
  limits: DebugLimits;
  usage: DebugUsage;
}

export type AgUiEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | ClientToolRequestEvent
  | DebugSnapshotEvent
  | UsageEvent;

export type ChatRole = "user" | "assistant";
export type ChatRunStatus = "idle" | "running" | "finished" | "error";
export type ChatToolCallStatus = "streaming" | "complete" | "interrupted";

export interface ChatToolCall {
  id: string;
  name: string;
  arguments: string;
  status: ChatToolCallStatus;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  streaming?: boolean;
  interrupted?: boolean;
  toolCalls?: ChatToolCall[];
  /** Model calls that produced this message. */
  usage?: ChatUsage;
}

export interface ChatState {
  messages: ChatMessage[];
  debugSnapshots: DebugSnapshotEvent[];
  clientToolRequests: ClientToolRequestEvent[];
  runId?: string;
  threadId?: string;
  status: ChatRunStatus;
  error?: string;
  /** The whole conversation's usage: what the server reported when it loaded, plus calls since. */
  usageTotal: ChatUsage;
}

export type ChatAction =
  | { type: "replace_messages"; messages: ChatMessage[] }
  | { type: "append_message"; message: ChatMessage }
  | { type: "apply_event"; event: AgUiEvent }
  | { type: "run_failed"; message: string }
  | { type: "run_cancelled" }
  | { type: "debug_preview"; snapshot: DebugSnapshotEvent; message: ChatMessage }
  | { type: "reset_conversation"; messages?: ChatMessage[] }
  | { type: "clear_error" };

export function createInitialChatState(messages: ChatMessage[] = [], usageTotal: ChatUsage = EMPTY_USAGE): ChatState {
  return {
    messages,
    debugSnapshots: [],
    clientToolRequests: [],
    status: "idle",
    usageTotal,
  };
}

export function chatUsageFromEvent(usage: DebugUsage): ChatUsage {
  return {
    promptTokens: usage.promptTokens, completionTokens: usage.completionTokens,
    cachedTokens: usage.cachedTokens ?? 0, reasoningTokens: usage.reasoningTokens ?? 0,
    ...(usage.costUsd !== undefined && { costUsd: usage.costUsd }), calls: 1,
  };
}

/**
 * A tool-only step has no message of its own, so its usage joins the turn's latest assistant message, or the
 * turn's user message when no reply exists yet. turnUsageByMessage counts both.
 */
function attachUsage(messages: ChatMessage[], messageId: string, usage: ChatUsage): ChatMessage[] {
  let index = messages.findIndex((message) => message.id === messageId);
  if (index === -1) {
    index = messages.length - 1;
    while (index >= 0 && messages[index].role !== "assistant" && messages[index].role !== "user") index--;
    if (index === -1) return messages;
  }
  return messages.map((message, i) => (i === index ? { ...message, usage: addUsage(message.usage, usage) } : message));
}

function updateMessage(
  messages: ChatMessage[],
  messageId: string,
  update: (message: ChatMessage) => ChatMessage,
): ChatMessage[] {
  const messageIndex = messages.findIndex((message) => message.id === messageId);
  if (messageIndex === -1) {
    return messages;
  }

  return messages.map((message, index) => (index === messageIndex ? update(message) : message));
}

function updateToolCall(
  messages: ChatMessage[],
  toolCallId: string,
  update: (toolCall: ChatToolCall) => ChatToolCall,
): ChatMessage[] {
  return messages.map((message) => {
    if (!message.toolCalls?.some((toolCall) => toolCall.id === toolCallId)) {
      return message;
    }

    return {
      ...message,
      toolCalls: message.toolCalls.map((toolCall) =>
        toolCall.id === toolCallId ? update(toolCall) : toolCall,
      ),
    };
  });
}

function interruptStreamingMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    streaming: message.streaming ? false : message.streaming,
    interrupted: message.streaming || message.toolCalls?.some((toolCall) => toolCall.status === "streaming")
      ? true
      : message.interrupted,
    toolCalls: message.toolCalls?.map((toolCall) =>
      toolCall.status === "streaming" ? { ...toolCall, status: "interrupted" as const } : toolCall
    ),
  }));
}

function applyEvent(state: ChatState, event: AgUiEvent): ChatState {
  switch (event.type) {
    case "RUN_STARTED": {
      const continuingRun = state.runId === event.runId;
      return {
        ...state,
        runId: event.runId,
        threadId: event.threadId,
        status: "running",
        error: undefined,
        debugSnapshots: continuingRun ? state.debugSnapshots : [],
        clientToolRequests: continuingRun ? state.clientToolRequests : [],
      };
    }
    case "RUN_FINISHED":
      return {
        ...state,
        runId: event.runId,
        threadId: event.threadId,
        status: "finished",
      };
    case "RUN_ERROR":
      return {
        ...state,
        messages: interruptStreamingMessages(state.messages),
        status: "error",
        error: event.message,
      };
    case "TEXT_MESSAGE_START":
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: event.messageId,
            role: event.role,
            content: "",
            streaming: true,
          },
        ],
      };
    case "TEXT_MESSAGE_CONTENT":
      return {
        ...state,
        messages: updateMessage(state.messages, event.messageId, (message) => ({
          ...message,
          content: message.content + event.delta,
        })),
      };
    case "TEXT_MESSAGE_END":
      return {
        ...state,
        messages: updateMessage(state.messages, event.messageId, (message) => ({
          ...message,
          streaming: false,
        })),
      };
    case "TOOL_CALL_START": {
      const parentMessageId = event.parentMessageId;
      const fallbackMessage = [...state.messages].reverse().find((message) => message.role === "assistant");
      const messageId = parentMessageId ?? fallbackMessage?.id;
      const toolCall: ChatToolCall = {
        id: event.toolCallId,
        name: event.toolCallName,
        arguments: "",
        status: "streaming",
      };

      if (!messageId) {
        return {
          ...state,
          messages: [
            ...state.messages,
            {
              id: `tool-message-${event.toolCallId}`,
              role: "assistant",
              content: "",
              streaming: true,
              toolCalls: [toolCall],
            },
          ],
        };
      }

      return {
        ...state,
        messages: updateMessage(state.messages, messageId, (message) => ({
          ...message,
          toolCalls: [...(message.toolCalls ?? []), toolCall],
        })),
      };
    }
    case "TOOL_CALL_ARGS":
      return {
        ...state,
        messages: updateToolCall(state.messages, event.toolCallId, (toolCall) => ({
          ...toolCall,
          arguments: toolCall.arguments + event.delta,
        })),
      };
    case "CLIENT_TOOL_REQUEST": {
      const clientToolRequests = [...state.clientToolRequests, event];
      const argumentsText = JSON.stringify(event.arguments ?? null);
      const hasToolCall = state.messages.some((message) =>
        message.toolCalls?.some((toolCall) => toolCall.id === event.toolCallId),
      );
      if (hasToolCall) {
        return {
          ...state,
          clientToolRequests,
          messages: updateToolCall(state.messages, event.toolCallId, (toolCall) => ({
            ...toolCall,
            name: event.toolName,
            arguments: argumentsText,
          })),
        };
      }
      const fallbackMessage = [...state.messages].reverse().find((message) => message.role === "assistant");
      const toolCall: ChatToolCall = {
        id: event.toolCallId,
        name: event.toolName,
        arguments: argumentsText,
        status: "streaming",
      };
      if (!fallbackMessage) {
        return {
          ...state,
          clientToolRequests,
          messages: [...state.messages, {
            id: `tool-message-${event.toolCallId}`,
            role: "assistant",
            content: "",
            streaming: true,
            toolCalls: [toolCall],
          }],
        };
      }
      return {
        ...state,
        clientToolRequests,
        messages: updateMessage(state.messages, fallbackMessage.id, (message) => ({
          ...message,
          toolCalls: [...(message.toolCalls ?? []), toolCall],
        })),
      };
    }
    case "DEBUG_SNAPSHOT":
      return {
        ...state,
        debugSnapshots: [...state.debugSnapshots, event],
      };
    case "USAGE": {
      const usage = chatUsageFromEvent(event.usage);
      return {
        ...state,
        messages: attachUsage(state.messages, event.messageId, usage),
        usageTotal: addUsage(state.usageTotal, usage)!,
      };
    }
    case "TOOL_CALL_END":
      return {
        ...state,
        messages: updateToolCall(state.messages, event.toolCallId, (toolCall) => ({
          ...toolCall,
          status: "complete",
        })),
      };
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "replace_messages":
      return { ...state, messages: action.messages };
    case "append_message":
      return { ...state, messages: [...state.messages, action.message] };
    case "apply_event":
      return applyEvent(state, action.event);
    case "run_failed":
      return { ...state, messages: interruptStreamingMessages(state.messages), status: "error", error: action.message };
    case "run_cancelled":
      return { ...state, messages: interruptStreamingMessages(state.messages), status: "idle" };
    case "debug_preview":
      return {
        ...state,
        messages: [...state.messages, action.message],
        debugSnapshots: [action.snapshot],
        clientToolRequests: [],
        runId: action.snapshot.runId,
        status: "idle",
        error: undefined,
      };
    case "reset_conversation":
      return {
        messages: action.messages ?? [],
        debugSnapshots: [],
        clientToolRequests: [],
        status: "idle",
        usageTotal: EMPTY_USAGE,
      };
    case "clear_error":
      return { ...state, error: undefined, status: state.status === "error" ? "idle" : state.status };
  }
}
