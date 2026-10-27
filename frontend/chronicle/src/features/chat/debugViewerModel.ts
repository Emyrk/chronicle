import type { ClientToolRequestEvent, DebugMessage, DebugSnapshotEvent } from "./protocol";

/** Everything the debug viewer shows. Same shape as the inspector's JSON download (schemaVersion 1). */
export interface DebugBundle {
  snapshots: DebugSnapshotEvent[];
  clientToolRequests: ClientToolRequestEvent[];
  error?: string;
}

export const emptyDebugBundle = (): DebugBundle => ({ snapshots: [], clientToolRequests: [] });

export const snapshotKey = (snapshot: DebugSnapshotEvent) => `${snapshot.runId}:${snapshot.iteration}:${snapshot.phase}`;

/** Parses a file produced by the inspector's Download JSON button. */
export function parseDebugBundle(text: string): DebugBundle {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Not a JSON file");
  }
  if (!value || typeof value !== "object") throw new Error("Not a Chronicle debug export");
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== 1) throw new Error("Unsupported debug export version");
  if (!Array.isArray(data.snapshots) || data.snapshots.some((s) => !s || (s as DebugSnapshotEvent).type !== "DEBUG_SNAPSHOT" || !Array.isArray((s as DebugSnapshotEvent).messages))) {
    throw new Error("Debug export has invalid snapshots");
  }
  const requests = data.clientToolRequests ?? [];
  if (!Array.isArray(requests)) throw new Error("Debug export has invalid client tool requests");
  return {
    snapshots: data.snapshots as DebugSnapshotEvent[],
    clientToolRequests: requests as ClientToolRequestEvent[],
    ...(typeof data.error === "string" ? { error: data.error } : {}),
  };
}

/**
 * Adds incoming snapshots and tool requests to what the viewer already has. The chat clears its
 * snapshots when a new run starts, so the viewer keeps earlier runs by merging rather than replacing.
 */
export function mergeDebugBundle(current: DebugBundle, incoming: DebugBundle): DebugBundle {
  const seen = new Set(current.snapshots.map(snapshotKey));
  const snapshots = [...current.snapshots, ...incoming.snapshots.filter((s) => !seen.has(snapshotKey(s)))];
  const seenTools = new Set(current.clientToolRequests.map((r) => r.toolCallId));
  const clientToolRequests = [...current.clientToolRequests, ...incoming.clientToolRequests.filter((r) => !seenTools.has(r.toolCallId))];
  const error = incoming.error ?? current.error;
  if (snapshots.length === current.snapshots.length && clientToolRequests.length === current.clientToolRequests.length && error === current.error) return current;
  return { snapshots, clientToolRequests, ...(error ? { error } : {}) };
}

export interface DebugRun {
  runId: string;
  snapshots: DebugSnapshotEvent[];
  clientToolRequests: ClientToolRequestEvent[];
  totalTokens: number;
  toolCalls: number;
}

/** Groups snapshots by run, in the order runs first appeared. */
export function groupRuns(bundle: DebugBundle): DebugRun[] {
  const runs = new Map<string, DebugRun>();
  for (const snapshot of bundle.snapshots) {
    let run = runs.get(snapshot.runId);
    if (!run) {
      run = { runId: snapshot.runId, snapshots: [], clientToolRequests: [], totalTokens: 0, toolCalls: 0 };
      runs.set(snapshot.runId, run);
    }
    run.snapshots.push(snapshot);
    run.totalTokens = Math.max(run.totalTokens, snapshot.usage.totalTokens);
  }
  for (const request of bundle.clientToolRequests) runs.get(request.runId)?.clientToolRequests.push(request);
  for (const run of runs.values()) {
    const last = run.snapshots.at(-1);
    run.toolCalls = last ? last.messages.reduce((count, message) => count + (message.toolCalls?.length ?? 0), 0) : 0;
  }
  return [...runs.values()];
}

/** Rough token estimate (about four characters per token) for comparing prompt sections. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

export const systemPrompt = (snapshot: DebugSnapshotEvent) =>
  snapshot.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");

export interface PromptSection {
  id: string;
  title: string;
  level: number;
  text: string;
  tokens: number;
}

/** Splits a prompt on markdown headings (ignoring code fences) so the viewer can show an outline. */
export function promptSections(prompt: string): PromptSection[] {
  const sections: PromptSection[] = [];
  let current = { title: "Preamble", level: 0, lines: [] as string[] };
  let fenced = false;
  const push = () => {
    const text = current.lines.join("\n");
    if (text.trim() || current.level > 0) {
      sections.push({ id: `section-${sections.length}`, title: current.title, level: current.level, text, tokens: estimateTokens(text) });
    }
  };
  for (const line of prompt.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = !fenced && /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      push();
      current = { title: heading[2].trim(), level: heading[1].length, lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  push();
  return sections;
}

const sameMessage = (a: DebugMessage, b: DebugMessage) =>
  a.role === b.role && a.content === b.content && a.toolCallId === b.toolCallId && (a.toolCalls?.length ?? 0) === (b.toolCalls?.length ?? 0);

export interface SnapshotDiff {
  /** Index of the first message that is new compared to the previous snapshot. */
  firstNewMessage: number;
  addedMessages: DebugMessage[];
  /** True when earlier messages changed (history was trimmed or rewritten), not just appended to. */
  historyRewritten: boolean;
  toolsAdded: string[];
  toolsRemoved: string[];
  systemPromptChanged: boolean;
  tokenDelta: number;
}

/** What changed between two snapshots. Without a previous snapshot every message counts as new. */
export function diffSnapshots(previous: DebugSnapshotEvent | undefined, next: DebugSnapshotEvent): SnapshotDiff {
  const before = previous?.messages ?? [];
  let common = 0;
  while (common < before.length && common < next.messages.length && sameMessage(before[common], next.messages[common])) common++;
  const beforeTools = new Set(previous?.tools.map((tool) => tool.name) ?? []);
  const nextTools = new Set(next.tools.map((tool) => tool.name));
  return {
    firstNewMessage: common,
    addedMessages: next.messages.slice(common),
    historyRewritten: common < before.length,
    toolsAdded: previous ? [...nextTools].filter((name) => !beforeTools.has(name)) : [],
    toolsRemoved: [...beforeTools].filter((name) => !nextTools.has(name)),
    systemPromptChanged: previous ? systemPrompt(previous) !== systemPrompt(next) : false,
    tokenDelta: next.usage.totalTokens - (previous?.usage.totalTokens ?? 0),
  };
}

/** Pretty-prints JSON strings (tool arguments and results); returns other text unchanged. */
export function prettyJSON(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return value;
  }
}
