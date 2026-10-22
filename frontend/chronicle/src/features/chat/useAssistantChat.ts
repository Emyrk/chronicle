import { useCallback, useEffect, useReducer, useRef } from "react";
import { AgUiClientError, runAgUi, type RunAgUiOptions } from "./client";
import {
  chatReducer,
  createInitialChatState,
  type AgUiEvent,
  type ChatMessage,
  type ChatState,
} from "./protocol";

export interface CreateChatRunRequestInput {
  messages: ChatMessage[];
  runId: string;
  threadId: string;
}

export interface DefaultChatRunRequest {
  messages: ChatMessage[];
  runId: string;
  threadId: string;
}

export interface UseAssistantChatOptions {
  endpoint: string;
  headers?: HeadersInit;
  initialMessages?: ChatMessage[];
  threadId?: string;
  createRequest?: (input: CreateChatRunRequestInput) => unknown;
  onMessagesChange?: (messages: ChatMessage[]) => void;
  runClient?: (options: RunAgUiOptions) => Promise<void>;
}

export interface AssistantChatController extends ChatState {
  isRunning: boolean;
  submit: (content: string) => Promise<boolean>;
  cancel: () => void;
  clearError: () => void;
}

function createId(prefix: string): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

export function createDefaultChatRunRequest(
  input: CreateChatRunRequestInput,
): DefaultChatRunRequest {
  return input;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof AgUiClientError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "The assistant run failed unexpectedly.";
}

export function useAssistantChat(options: UseAssistantChatOptions): AssistantChatController {
  const [state, dispatch] = useReducer(
    chatReducer,
    options.initialMessages ?? [],
    createInitialChatState,
  );
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRunRef = useRef(false);
  const messagesRef = useRef(state.messages);
  const threadIdRef = useRef(options.threadId ?? createId("thread"));
  const onMessagesChange = options.onMessagesChange;
  messagesRef.current = state.messages;

  useEffect(() => {
    onMessagesChange?.(state.messages);
  }, [onMessagesChange, state.messages]);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  const cancel = useCallback(() => {
    if (!activeRunRef.current) {
      return;
    }
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    activeRunRef.current = false;
    dispatch({ type: "run_cancelled" });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: "clear_error" });
  }, []);

  const submit = useCallback(
    async (content: string): Promise<boolean> => {
      const trimmedContent = content.trim();
      if (!trimmedContent || activeRunRef.current) {
        return false;
      }

      const userMessage: ChatMessage = {
        id: createId("message"),
        role: "user",
        content: trimmedContent,
      };
      const messages = [...messagesRef.current, userMessage];
      const runId = createId("run");
      const threadId = threadIdRef.current;
      const abortController = new AbortController();
      activeRunRef.current = true;
      abortControllerRef.current = abortController;
      dispatch({ type: "append_message", message: userMessage });
      dispatch({
        type: "apply_event",
        event: { type: "RUN_STARTED", runId, threadId },
      });

      const requestInput = { messages, runId, threadId };
      const body = (options.createRequest ?? createDefaultChatRunRequest)(requestInput);
      const onEvent = (event: AgUiEvent) => dispatch({ type: "apply_event", event });

      try {
        await (options.runClient ?? runAgUi)({
          url: options.endpoint,
          body,
          headers: options.headers,
          signal: abortController.signal,
          onEvent,
        });
        return true;
      } catch (error) {
        if (error instanceof AgUiClientError && error.kind === "aborted") {
          return false;
        }
        dispatch({ type: "run_failed", message: getErrorMessage(error) });
        return false;
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
          activeRunRef.current = false;
        }
      }
    },
    [options.createRequest, options.endpoint, options.headers, options.runClient],
  );

  return {
    ...state,
    isRunning: state.status === "running",
    submit,
    cancel,
    clearError,
  };
}
