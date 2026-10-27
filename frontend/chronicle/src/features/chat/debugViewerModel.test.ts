import { describe, expect, it } from "vitest";
import { serializeInferenceDebug } from "./debugExport";
import { diffSnapshots, groupRuns, mergeDebugBundle, parseDebugBundle, prettyJSON, promptSections } from "./debugViewerModel";
import type { ClientToolRequestEvent, DebugMessage, DebugSnapshotEvent } from "./protocol";

function snapshot(runId: string, iteration: number, phase: DebugSnapshotEvent["phase"], messages: DebugMessage[], totalTokens = 10): DebugSnapshotEvent {
  return {
    type: "DEBUG_SNAPSHOT", runId, iteration, phase, assistantId: "lua-workshop", model: "m", persistence: "durable", messages,
    tools: [{ name: "read_lua_files", description: "Read", parameters: { type: "object" } }], skills: [],
    limits: { maxHistoryMessages: 1, maxHistoryBytes: 1, maxIterations: 1, maxToolCalls: 1, maxToolArguments: 1, maxToolOutput: 1, maxAssistantText: 1 },
    usage: { promptTokens: totalTokens, completionTokens: 0, totalTokens },
  };
}
const system: DebugMessage = { role: "system", content: "You help.\n\n# Addon API reference\nIntro\n\n## Events\n```lua\n# not a heading\n```\n### Fields\nsource" };
const user: DebugMessage = { role: "user", content: "hi" };
const call: DebugMessage = { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "read_lua_files", arguments: "{}" }] };
const request = { type: "CLIENT_TOOL_REQUEST", runId: "r1", threadId: "t", toolCallId: "c1", toolName: "read_lua_files", arguments: {},
  capability: { id: "lua-editor", version: 1 }, effect: "read", confirmation: "never" } satisfies ClientToolRequestEvent;

describe("debug viewer model", () => {
  it("round-trips the inspector's download format", () => {
    const bundle = parseDebugBundle(serializeInferenceDebug([snapshot("r1", 1, "request", [system])], [request], "boom"));
    expect(bundle.snapshots).toHaveLength(1);
    expect(bundle.clientToolRequests).toEqual([request]);
    expect(bundle.error).toBe("boom");
    expect(() => parseDebugBundle("{}")).toThrow(/version/);
    expect(() => parseDebugBundle("nope")).toThrow(/JSON/);
  });

  it("keeps earlier runs when the chat resets its snapshots for a new run", () => {
    const first = { snapshots: [snapshot("r1", 1, "request", [system, user])], clientToolRequests: [request] };
    const second = { snapshots: [snapshot("r2", 1, "request", [system, user])], clientToolRequests: [] };
    const merged = mergeDebugBundle(mergeDebugBundle(first, first), second);
    expect(merged.snapshots.map((s) => s.runId)).toEqual(["r1", "r2"]);
    expect(mergeDebugBundle(merged, second)).toBe(merged);
    expect(groupRuns(merged).map((run) => [run.runId, run.clientToolRequests.length])).toEqual([["r1", 1], ["r2", 0]]);
  });

  it("outlines the prompt by heading and ignores headings inside code fences", () => {
    expect(promptSections(system.content).map((section) => [section.title, section.level])).toEqual([
      ["Preamble", 0], ["Addon API reference", 1], ["Events", 2], ["Fields", 3],
    ]);
  });

  it("reports what a snapshot added to the previous one", () => {
    const before = snapshot("r1", 1, "request", [system, user], 10);
    const after = { ...snapshot("r1", 1, "response", [system, user, call], 25), tools: [] };
    const diff = diffSnapshots(before, after);
    expect(diff.firstNewMessage).toBe(2);
    expect(diff.addedMessages).toEqual([call]);
    expect(diff.historyRewritten).toBe(false);
    expect(diff.toolsRemoved).toEqual(["read_lua_files"]);
    expect(diff.tokenDelta).toBe(15);
    expect(diffSnapshots(after, before).historyRewritten).toBe(true);
    expect(diffSnapshots(undefined, before).firstNewMessage).toBe(0);
  });

  it("pretty-prints JSON tool payloads only", () => {
    expect(prettyJSON('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyJSON("plain {text}")).toBe("plain {text}");
  });
});
