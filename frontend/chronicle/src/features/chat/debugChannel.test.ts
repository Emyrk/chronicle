import { describe, expect, it } from "vitest";
import { openDebugPublisher, subscribeDebugChannel, type DebugChannelMessage } from "./debugChannel";
import type { DebugSnapshotEvent } from "./protocol";

const snapshot = (runId: string) => ({
  type: "DEBUG_SNAPSHOT", runId, iteration: 1, phase: "request", assistantId: "a", model: "m", persistence: "durable",
  messages: [], tools: [], skills: [],
  limits: { maxHistoryMessages: 1, maxHistoryBytes: 1, maxIterations: 1, maxToolCalls: 1, maxToolArguments: 1, maxToolOutput: 1, maxAssistantText: 1 },
  usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
}) satisfies DebugSnapshotEvent;

function nextMessage(received: DebugChannelMessage[], count: number) {
  return new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const check = () => (received.length >= count ? resolve() : Date.now() - started > 2000 ? reject(new Error("timed out")) : setTimeout(check, 5));
    check();
  });
}

describe("debug viewer channel", () => {
  it("answers a viewer that joins later, streams updates, and says goodbye", async () => {
    const publisher = openDebugPublisher("c1", { bundle: { snapshots: [snapshot("r1")], clientToolRequests: [] }, title: "Workshop" });
    const received: DebugChannelMessage[] = [];
    const unsubscribe = subscribeDebugChannel("c1", (message) => received.push(message));
    await nextMessage(received, 1);
    expect(received[0]).toMatchObject({ type: "state", title: "Workshop", bundle: { snapshots: [{ runId: "r1" }] } });

    publisher.publish({ bundle: { snapshots: [snapshot("r2")], clientToolRequests: [] }, title: "Workshop" });
    await nextMessage(received, 2);
    expect(received[1]).toMatchObject({ type: "state", bundle: { snapshots: [{ runId: "r2" }] } });

    publisher.close();
    await nextMessage(received, 3);
    expect(received[2]).toEqual({ type: "bye" });
    unsubscribe();
  });

  it("does not cross channels", async () => {
    const publisher = openDebugPublisher("a", { bundle: { snapshots: [], clientToolRequests: [] } });
    const received: DebugChannelMessage[] = [];
    const unsubscribe = subscribeDebugChannel("b", (message) => received.push(message));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(received).toEqual([]);
    publisher.close();
    unsubscribe();
  });
});
