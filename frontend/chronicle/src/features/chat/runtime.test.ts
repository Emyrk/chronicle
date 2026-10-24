import { describe, expect, it, vi } from "vitest";
import { InferenceRuntime, type InferenceToolHandler } from "./runtime";
import type { ClientToolRequestEvent } from "./protocol";

function request(overrides: Partial<ClientToolRequestEvent> = {}): ClientToolRequestEvent {
  return {
    type: "CLIENT_TOOL_REQUEST",
    runId: "run-1",
    threadId: "thread-1",
    toolCallId: "call-1",
    toolName: "inspect",
    arguments: { value: 7 },
    clientSessionId: "session-1",
    capability: { id: "page", version: 1, scopeType: "route", scopeId: "rankings", stateRevision: 4 },
    effect: "read",
    confirmation: "never",
    ...overrides,
  };
}

function register(
  runtime: InferenceRuntime,
  handler: InferenceToolHandler = vi.fn(async (args) => ({ args })),
) {
  return runtime.registerCapability({
    id: "page",
    version: 1,
    scope: { type: "route", id: "rankings" },
    stateRevision: 4,
    tools: { inspect: handler },
  });
}

describe("InferenceRuntime", () => {
  it("rejects registration collisions and advertises frontend-only descriptors", () => {
    const runtime = new InferenceRuntime({ sessionId: "session-1" });
    const unregister = register(runtime);
    expect(() => register(runtime)).toThrow(/already registered/);
    expect(runtime.getClientDescriptor()).toEqual({
      session_id: "session-1",
      capabilities: [{ id: "page", version: 1, scope_type: "route", scope_id: "rankings", state_revision: 4 }],
    });
    unregister();
    expect(runtime.getClientDescriptor().capabilities).toEqual([]);
  });

  it("preserves revision zero in advertisements and continuations", async () => {
    const runtime = new InferenceRuntime({ sessionId: "session-1" });
    runtime.registerCapability({
      id: "page",
      version: 1,
      scope: { type: "route", id: "rankings" },
      stateRevision: 0,
      tools: { inspect: vi.fn(() => ({ ok: true })) },
    });
    expect(runtime.getClientDescriptor().capabilities[0]).toMatchObject({ state_revision: 0 });
    await expect(runtime.executeClientTool(request({
      capability: { ...request().capability, stateRevision: 0 },
    }), new AbortController().signal)).resolves.toMatchObject({
      status: "success",
      state_revision: 0,
    });
  });

  it("returns unavailable for an unmounted capability and stale_state for a changed revision", async () => {
    const runtime = new InferenceRuntime({ sessionId: "session-1" });
    const unregister = register(runtime);
    await expect(runtime.executeClientTool(request({ capability: { ...request().capability, stateRevision: 3 } }), new AbortController().signal))
      .resolves.toMatchObject({
        status: "stale_state",
        capability_id: "page",
        capability_version: 1,
        scope_type: "route",
        scope_id: "rankings",
        state_revision: 3,
      });
    unregister();
    await expect(runtime.executeClientTool(request(), new AbortController().signal))
      .resolves.toMatchObject({ status: "capability_unavailable" });
  });

  it("confirms mutations, records rejection, and bypasses confirmation in YOLO mode", async () => {
    const rejected = new InferenceRuntime({ sessionId: "session-1", confirm: async () => false });
    const rejectedHandler = vi.fn();
    register(rejected, rejectedHandler);
    await expect(rejected.executeClientTool(request({ effect: "view_mutation", confirmation: "unless_yolo" }), new AbortController().signal))
      .resolves.toMatchObject({ status: "user_rejected" });
    expect(rejectedHandler).not.toHaveBeenCalled();

    const approve = vi.fn(async () => true);
    const approved = new InferenceRuntime({ sessionId: "session-1", confirm: approve });
    register(approved);
    await expect(approved.executeClientTool(request({ effect: "view_mutation", confirmation: "unless_yolo" }), new AbortController().signal))
      .resolves.toMatchObject({ status: "success" });
    expect(approve).toHaveBeenCalledOnce();

    const yoloConfirm = vi.fn(async () => false);
    const yolo = new InferenceRuntime({ sessionId: "session-1", confirm: yoloConfirm, isYoloEnabled: () => true });
    register(yolo);
    await expect(yolo.executeClientTool(request({ effect: "view_mutation", confirmation: "unless_yolo" }), new AbortController().signal))
      .resolves.toMatchObject({ status: "success" });
    expect(yoloConfirm).not.toHaveBeenCalled();
  });

  it("returns stale_state when the capability revision changes during confirmation", async () => {
    let resolveConfirmation!: (approved: boolean) => void;
    const runtime = new InferenceRuntime({
      sessionId: "session-1",
      confirm: () => new Promise((resolve) => { resolveConfirmation = resolve; }),
    });
    const handler = vi.fn(() => ({ ok: true }));
    const unregister = register(runtime, handler);
    const pending = runtime.executeClientTool(
      request({ effect: "view_mutation", confirmation: "unless_yolo" }),
      new AbortController().signal,
    );

    unregister();
    runtime.registerCapability({
      id: "page",
      version: 1,
      scope: { type: "route", id: "rankings" },
      stateRevision: 5,
      tools: { inspect: handler },
    });
    resolveConfirmation(true);

    await expect(pending).resolves.toMatchObject({ status: "stale_state", state_revision: 4 });
    expect(handler).not.toHaveBeenCalled();
  });

  it("keeps a successful result when the mutation re-registers its capability", async () => {
    const runtime = new InferenceRuntime({ sessionId: "session-1" });
    const handler = vi.fn(() => {
      unregister();
      runtime.registerCapability({
        id: "page",
        version: 1,
        scope: { type: "route", id: "rankings" },
        stateRevision: 5,
        tools: { inspect: handler },
      });
      return { applied: true };
    });
    const unregister = register(runtime, handler);

    await expect(runtime.executeClientTool(request(), new AbortController().signal)).resolves.toMatchObject({
      status: "success",
      result: { applied: true },
    });
  });

  it("normalizes handler failures without exposing stack details", async () => {
    const runtime = new InferenceRuntime({ sessionId: "session-1" });
    register(runtime, vi.fn(() => { throw new Error("secret stack detail"); }));
    const result = await runtime.executeClientTool(request(), new AbortController().signal);
    expect(result).toMatchObject({ status: "client_error" });
    expect(JSON.stringify(result)).not.toContain("secret stack detail");
  });

  it("preserves an intentional capability-unavailable explanation", async () => {
    const runtime = new InferenceRuntime({ sessionId: "session-1" });
    register(runtime, vi.fn(() => {
      throw new Error("capability_unavailable: This instance view is read-only while following a live session.");
    }));

    await expect(runtime.executeClientTool(request(), new AbortController().signal)).resolves.toMatchObject({
      status: "capability_unavailable",
      result: { message: "This instance view is read-only while following a live session." },
    });
  });

  it("returns capability_unavailable when a capability unmounts during execution", async () => {
    let finish!: (value: unknown) => void;
    const runtime = new InferenceRuntime({ sessionId: "session-1" });
    const unregister = register(runtime, vi.fn(() => new Promise((resolve) => { finish = resolve; })));
    const pending = runtime.executeClientTool(request(), new AbortController().signal);
    unregister();
    finish({ ok: true });
    await expect(pending).resolves.toMatchObject({ status: "capability_unavailable" });
  });

  it("converts oversized or non-serializable successful results into bounded client errors", async () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    const runtime = new InferenceRuntime({ sessionId: "session-1" });
    register(runtime, vi.fn(() => circular));
    await expect(runtime.executeClientTool(request(), new AbortController().signal))
      .resolves.toMatchObject({ status: "client_error", result: { message: expect.stringContaining("non-serializable") } });
  });

  it("aborts while a mutation is waiting for confirmation", async () => {
    const runtime = new InferenceRuntime({
      sessionId: "session-1",
      confirm: () => new Promise(() => undefined),
    });
    register(runtime);
    const controller = new AbortController();
    const pending = runtime.executeClientTool(
      request({ effect: "view_mutation", confirmation: "unless_yolo" }),
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("propagates abort instead of submitting a client result", async () => {
    const runtime = new InferenceRuntime({ sessionId: "session-1" });
    register(runtime, vi.fn((_args, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })));
    const controller = new AbortController();
    const pending = runtime.executeClientTool(request(), controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
