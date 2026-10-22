import type { InferenceMessage, InferenceModel, InferenceRunRequest } from "@/api/typesGenerated";
import type { ChatMessage } from "./protocol";
import type { CreateChatRunRequestInput } from "./useAssistantChat";

export interface InferenceSelection {
  connectionId: string;
  modelId: string;
}

export function buildSiteHelpRunRequest(
  input: CreateChatRunRequestInput,
  selection: InferenceSelection,
): InferenceRunRequest {
  return {
    run_id: input.runId,
    connection_id: selection.connectionId,
    model: selection.modelId,
    assistant_id: "site-help",
    messages: input.messages.map(toInferenceMessage),
  };
}

export function buildInstanceAnalystRunRequest(
  input: CreateChatRunRequestInput,
  selection: InferenceSelection,
  instanceId: string,
): InferenceRunRequest {
  const message = input.messages.at(-1);
  if (!message || message.role !== "user") {
    throw new Error("An instance assistant run requires a new user message.");
  }
  return {
    run_id: input.runId,
    connection_id: selection.connectionId,
    model: selection.modelId,
    assistant_id: "instance-analyst",
    thread_id: input.threadId,
    instance: instanceId,
    message: toInferenceMessage(message),
  };
}

export function toInferenceMessage(message: ChatMessage): InferenceMessage {
  return { id: message.id, role: message.role, content: message.content };
}

export function toChatMessages(messages: readonly InferenceMessage[]): ChatMessage[] {
  return messages.flatMap((message, index) => {
    if ((message.role !== "user" && message.role !== "assistant") || !message.content) return [];
    return [{
      id: message.id ?? `stored-message-${index}`,
      role: message.role,
      content: message.content,
    } satisfies ChatMessage];
  });
}

export function chooseDefaultModel(models: readonly InferenceModel[], storedModelId?: string): string | undefined {
  if (storedModelId && models.some((model) => model.id === storedModelId)) return storedModelId;
  return [...models].sort((left, right) =>
    left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
  )[0]?.id;
}

export function safeLocalReturnPath(pathname: string, search: string): string {
  const path = `${pathname}${search}`;
  return pathname.startsWith("/") && !pathname.startsWith("//") ? path : "/account/settings";
}

export interface InferenceOAuthResult {
  type: "success" | "error";
  message: string;
  keys: string[];
}

export function parseInferenceOAuthResult(searchParams: URLSearchParams): InferenceOAuthResult | null {
  const status = searchParams.get("inference_connection");
  if (status === "error") {
    return {
      type: "error",
      message: "OpenRouter could not be connected.",
      keys: ["inference_connection"],
    };
  }
  if (status === "success") {
    return {
      type: "success",
      message: "OpenRouter connected successfully.",
      keys: ["inference_connection"],
    };
  }
  return null;
}
