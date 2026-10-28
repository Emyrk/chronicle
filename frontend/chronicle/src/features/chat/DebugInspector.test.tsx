import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DebugInspector } from "./DebugInspector";
import { serializeInferenceDebug } from "./debugExport";
import type { DebugSnapshotEvent } from "./protocol";

const snapshot: DebugSnapshotEvent = {
  type: "DEBUG_SNAPSHOT",
  runId: "run-1",
  iteration: 1,
  phase: "client_tool_request",
  assistantId: "instance-analyst",
  model: "provider/model",
  persistence: "durable",
  contextType: "instance",
  contextId: "instance-1",
  messages: [{ role: "system", content: "instructions" }],
  tools: [{ name: "inspect_instance_ui", description: "Inspect the UI", parameters: { type: "object" } }],
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
  usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
};

describe("DebugInspector", () => {
  it("serializes downloadable snapshots without dropping the client-tool phase", () => {
    const request = {
      type: "CLIENT_TOOL_REQUEST" as const,
      runId: "run-1",
      threadId: "thread-1",
      toolCallId: "call-1",
      toolName: "inspect_instance_ui",
      arguments: { include: ["panels"] },
      capability: { id: "instance-page", version: 1, scopeType: "instance", scopeId: "instance-1", stateRevision: 0 },
      clientSessionId: "session-1",
      effect: "read" as const,
      confirmation: "never" as const,
    };
    expect(JSON.parse(serializeInferenceDebug([snapshot], [request], "continuation failed"))).toEqual({
      schemaVersion: 1,
      snapshots: [snapshot],
      clientToolRequests: [request],
      error: "continuation failed",
    });
  });

  it("renders a JSON download control", () => {
    const markup = renderToStaticMarkup(<DebugInspector channelId="test" snapshots={[snapshot]} clientToolRequests={[]} />);
    expect(markup).toContain("Download JSON");
    expect(markup).not.toContain("disabled=\"\"");
  });
});
