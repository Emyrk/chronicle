import { describe, expect, it } from "vitest";
import { isolationExitURL, isolationTestEnabled, verifyIsolationProbe } from "./isolationProbe";
import workerSource from "./isolationProbe.worker.js?raw";

describe("isolation diagnostic", () => {
  it("requires exactly one explicit opt-in", () => {
    expect(isolationTestEnabled("?isolationTest=1&foo=bar")).toBe(true);
    for (const query of ["", "?isolationTest", "?isolationTest=true", "?isolationTest=0", "?isolationTest=1&isolationTest=1"]) {
      expect(isolationTestEnabled(query)).toBe(false);
    }
  });
  it("exits without losing other URL state", () => {
    expect(isolationExitURL("https://example.com/instances/raid?foo=bar&isolationTest=1#replay"))
      .toBe("https://example.com/instances/raid?foo=bar#replay");
  });
  it("requires the mutation in the original shared buffer, not just an acknowledgement", () => {
    const view = new Int32Array(new SharedArrayBuffer(4));
    Atomics.store(view, 0, 41);
    expect(() => verifyIsolationProbe({ type: "result", isolated: true }, view)).toThrow("mutation");
    Atomics.store(view, 0, 42);
    expect(verifyIsolationProbe({ type: "result", isolated: true }, view)).toBe(true);
    expect(verifyIsolationProbe({ type: "result", isolated: false }, view)).toBe(false);
    for (const response of [null, {}, { type: "result", isolated: "true" }, { type: "error" }]) {
      expect(() => verifyIsolationProbe(response, view)).toThrow("invalid response");
    }
  });
  it("executes the shipped worker protocol against shared memory", () => {
    const messages: unknown[] = [];
    const scope = { crossOriginIsolated: true, postMessage: (data: unknown) => messages.push(data), onmessage: (_event: { data: unknown }) => { void _event; } };
    // Test the exact blob source without pretending this is browser isolation coverage.
    new Function("self", workerSource)(scope);
    const buffer = new SharedArrayBuffer(4);
    const view = new Int32Array(buffer);
    Atomics.store(view, 0, 41);
    scope.onmessage({ data: buffer });
    expect(verifyIsolationProbe(messages[0], view)).toBe(true);
    scope.onmessage({ data: new ArrayBuffer(4) });
    expect(messages[1]).toMatchObject({ type: "error" });
  });
});
