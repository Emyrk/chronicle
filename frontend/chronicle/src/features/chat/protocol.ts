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
  version: string;
  scopeType?: string;
  scopeId?: string;
  stateRevision?: string;
}

export interface ClientToolRequestEvent extends AgUiEventBase {
  type: "CLIENT_TOOL_REQUEST";
  runId: string;
  threadId: string;
  toolCallId: string;
  toolName: string;
  arguments: string;
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
}

export interface DebugSnapshotEvent extends AgUiEventBase {
  type: "DEBUG_SNAPSHOT";
  runId: string;
  iteration: number;
  phase: "request" | "tool_results" | "response";
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
  | DebugSnapshotEvent;

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
}

export interface ChatState {
  messages: ChatMessage[];
  debugSnapshots: DebugSnapshotEvent[];
  runId?: string;
  threadId?: string;
  status: ChatRunStatus;
  error?: string;
}

export type ChatAction =
  | { type: "replace_messages"; messages: ChatMessage[] }
  | { type: "append_message"; message: ChatMessage }
  | { type: "apply_event"; event: AgUiEvent }
  | { type: "run_failed"; message: string }
  | { type: "run_cancelled" }
  | { type: "clear_error" };

export function createInitialChatState(messages: ChatMessage[] = []): ChatState {
  return {
    messages,
    debugSnapshots: [],
    status: "idle",
  };
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
    case "RUN_STARTED":
      return {
        ...state,
        runId: event.runId,
        threadId: event.threadId,
        status: "running",
        error: undefined,
        debugSnapshots: [],
      };
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
      const hasToolCall = state.messages.some((message) =>
        message.toolCalls?.some((toolCall) => toolCall.id === event.toolCallId),
      );
      if (hasToolCall) {
        return {
          ...state,
          messages: updateToolCall(state.messages, event.toolCallId, (toolCall) => ({
            ...toolCall,
            name: event.toolName,
            arguments: event.arguments,
          })),
        };
      }
      const fallbackMessage = [...state.messages].reverse().find((message) => message.role === "assistant");
      const toolCall: ChatToolCall = {
        id: event.toolCallId,
        name: event.toolName,
        arguments: event.arguments,
        status: "streaming",
      };
      if (!fallbackMessage) {
        return {
          ...state,
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
    case "clear_error":
      return { ...state, error: undefined, status: state.status === "error" ? "idle" : state.status };
  }
}
