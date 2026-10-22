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

export type AgUiEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent;

export type ChatRole = "user" | "assistant";
export type ChatRunStatus = "idle" | "running" | "finished" | "error";
export type ChatToolCallStatus = "streaming" | "complete";

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
  toolCalls?: ChatToolCall[];
}

export interface ChatState {
  messages: ChatMessage[];
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

function applyEvent(state: ChatState, event: AgUiEvent): ChatState {
  switch (event.type) {
    case "RUN_STARTED":
      return {
        ...state,
        runId: event.runId,
        threadId: event.threadId,
        status: "running",
        error: undefined,
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
      return { ...state, status: "error", error: action.message };
    case "run_cancelled":
      return { ...state, status: "idle" };
    case "clear_error":
      return { ...state, error: undefined, status: state.status === "error" ? "idle" : state.status };
  }
}
