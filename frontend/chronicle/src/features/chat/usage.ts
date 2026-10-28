import type { InferenceUsage } from "@/api/typesGenerated";
import type { ChatMessage } from "./protocol";

/** Token and cost accounting for one or more model calls. */
export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  /** OpenRouter credits (1 credit = 1 USD). Undefined while no call reported a cost. */
  costUsd?: number;
  calls: number;
}

export const EMPTY_USAGE: ChatUsage = { promptTokens: 0, completionTokens: 0, cachedTokens: 0, reasoningTokens: 0, calls: 0 };

export function usageFromApi(usage: InferenceUsage): ChatUsage {
  return {
    promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens,
    cachedTokens: usage.cached_tokens, reasoningTokens: usage.reasoning_tokens,
    ...(usage.cost_usd !== undefined && { costUsd: usage.cost_usd }), calls: usage.calls,
  };
}

export function addUsage(a: ChatUsage | undefined, b: ChatUsage | undefined): ChatUsage | undefined {
  if (!a) return b;
  if (!b) return a;
  const cost = a.costUsd === undefined && b.costUsd === undefined ? undefined : (a.costUsd ?? 0) + (b.costUsd ?? 0);
  return {
    promptTokens: a.promptTokens + b.promptTokens, completionTokens: a.completionTokens + b.completionTokens,
    cachedTokens: a.cachedTokens + b.cachedTokens, reasoningTokens: a.reasoningTokens + b.reasoningTokens,
    ...(cost !== undefined && { costUsd: cost }), calls: a.calls + b.calls,
  };
}

/** "$1.23", "$0.042", "$0.00031"; small amounts keep two significant digits. */
export function formatCost(costUsd: number): string {
  if (costUsd === 0) return "$0";
  if (costUsd >= 1) return `$${costUsd.toFixed(2)}`;
  if (costUsd >= 0.01) return `$${costUsd.toFixed(3)}`;
  return `$${Number(costUsd.toPrecision(2))}`;
}

export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(tokens < 10_000 ? 1 : 0)}k`;
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}

/** "12.3k tokens · $0.042", leaving out the cost when it is unknown. */
export function formatUsage(usage: ChatUsage): string {
  const tokens = `${formatTokens(usage.promptTokens + usage.completionTokens)} tokens`;
  return usage.costUsd === undefined ? tokens : `${tokens} · ${formatCost(usage.costUsd)}`;
}

/** A tooltip with the full breakdown. */
export function describeUsage(usage: ChatUsage): string {
  const lines = [
    `${usage.promptTokens.toLocaleString()} input tokens${usage.cachedTokens ? ` (${usage.cachedTokens.toLocaleString()} cached)` : ""}`,
    `${usage.completionTokens.toLocaleString()} output tokens${usage.reasoningTokens ? ` (${usage.reasoningTokens.toLocaleString()} reasoning)` : ""}`,
    `${usage.calls} model ${usage.calls === 1 ? "call" : "calls"}`,
    usage.costUsd === undefined ? "Cost not reported by the provider" : `Cost: $${usage.costUsd.toFixed(6)} (OpenRouter credits)`,
  ];
  return lines.join("\n");
}

/** The usage of each finished turn, keyed by the turn's last assistant message. */
export function turnUsageByMessage(messages: readonly ChatMessage[], running: boolean): Map<string, ChatUsage> {
  const result = new Map<string, ChatUsage>();
  let turn: ChatUsage | undefined;
  messages.forEach((message, index) => {
    // A user message carries the usage of steps that ran before the turn had a reply.
    if (message.role === "user") { turn = message.usage; return; }
    turn = addUsage(turn, message.usage);
    const next = messages[index + 1];
    const last = !next || next.role === "user";
    if (last && turn && !(running && !next)) result.set(message.id, turn);
  });
  return result;
}
