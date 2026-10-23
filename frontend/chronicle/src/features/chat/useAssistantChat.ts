import { useCallback, useEffect, useReducer, useRef } from "react";
import { AgUiClientError, runAgUi, type RunAgUiOptions } from "./client";
import { useOptionalInferenceRuntime, type InferenceClientDescriptor } from "./runtime";
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
  client?: InferenceClientDescriptor;
}

export interface DefaultChatRunRequest {
  messages: ChatMessage[];
  runId: string;
  threadId: string;
  client?: InferenceClientDescriptor;
}

export interface UseAssistantChatOptions {
  endpoint: string;
  headers?: HeadersInit;
  initialMessages?: ChatMessage[];
  threadId?: string;
  createRequest?: (input: CreateChatRunRequestInput) => unknown;
  onMessagesChange?: (messages: ChatMessage[]) => void;
  onRunComplete?: () => void | Promise<void>;
  onRunSettled?: () => void | Promise<void>;
  onStartNewChat?: () => void | ChatMessage[] | Promise<void | ChatMessage[]>;
  runClient?: (options: RunAgUiOptions) => Promise<void>;
}

export interface AssistantChatController extends ChatState {
  isRunning: boolean;
  submit: (content: string) => Promise<boolean>;
  startNewChat: () => Promise<boolean>;
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

export function isClearCommand(content: string): boolean {
  return content.trim().toLowerCase() === "/clear";
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
  const runtime = useOptionalInferenceRuntime();
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

  const startNewChat = useCallback(async (): Promise<boolean> => {
    if (activeRunRef.current) return false;
    try {
      const messages = await options.onStartNewChat?.();
      dispatch({ type: "reset_conversation", messages: messages ?? [] });
      return true;
    } catch (error) {
      dispatch({ type: "run_failed", message: getErrorMessage(error) });
      return false;
    }
  }, [options]);

  const submit = useCallback(
    async (content: string): Promise<boolean> => {
      const trimmedContent = content.trim();
      if (!trimmedContent || activeRunRef.current) {
        return false;
      }

      if (isClearCommand(trimmedContent)) {
        return startNewChat();
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

      const requestInput = {
        messages,
        runId,
        threadId,
        ...(runtime ? { client: runtime.getClientDescriptor() } : {}),
      };
      const onEvent = (event: AgUiEvent) => dispatch({ type: "apply_event", event });

      try {
        const body = (options.createRequest ?? createDefaultChatRunRequest)(requestInput);
        await (options.runClient ?? runAgUi)({
          url: options.endpoint,
          body,
          headers: options.headers,
          signal: abortController.signal,
          runtime: runtime ?? undefined,
          onEvent,
        });
        await options.onRunComplete?.();
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
        try {
          await options.onRunSettled?.();
        } catch {
          // A refresh failure must not leave the controller wedged after the run settles.
        }
      }
    },
    [options, runtime, startNewChat],
  );

  return {
    ...state,
    isRunning: state.status === "running",
    submit,
    startNewChat,
    cancel,
    clearError,
  };
}
