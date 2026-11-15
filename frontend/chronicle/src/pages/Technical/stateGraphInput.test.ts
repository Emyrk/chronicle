import { afterEach, describe, expect, it, vi } from "vitest";
import { coerceStateGraph, parseStateGraph } from "./stateGraph";
import { fetchSnapshotGraph, readStateGraphBlob, snapshotDownloadURL } from "./stateGraphInput";

const graph = { version: 1, root: "/root", nodes: [{ path: "/root", kind: "directory" }] };
const checkpoint = { version: 2, graph: { version: 1, graph } };
const log = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const artifact = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

afterEach(() => vi.unstubAllGlobals());

describe("stategraph snapshot input", () => {
  it("preserves raw graphs and unwraps ownergraphs and checkpoint v2", () => {
    const expected = coerceStateGraph(graph);
    expect(parseStateGraph(JSON.stringify(graph))).toEqual(expected);
    expect(coerceStateGraph(checkpoint.graph)).toEqual(expected);
    expect(coerceStateGraph(checkpoint)).toEqual(expected);
    expect(coerceStateGraph({ ...checkpoint, version: 3 }).issues[0].message).toContain("Unsupported checkpoint");
  });

  it("accepts local JSON and gzip by bytes irrespective of file metadata", async () => {
    const blob = new Blob([JSON.stringify(checkpoint)]);
    const gzip = await new Response(blob.stream().pipeThrough(new CompressionStream("gzip"))).blob();
    expect(await readStateGraphBlob(blob)).toEqual(coerceStateGraph(graph));
    expect(await readStateGraphBlob(gzip)).toEqual(coerceStateGraph(graph));
  });

  it("rejects oversized plain and decompressed gzip input before parsing", async () => {
    const blob = new Blob([JSON.stringify({ ...checkpoint, padding: "x".repeat(4096) })]);
    const gzip = await new Response(blob.stream().pipeThrough(new CompressionStream("gzip"))).blob();
    expect(gzip.size).toBeLessThan(512);
    await expect(readStateGraphBlob(blob, 512)).rejects.toThrow("Inspect this snapshot offline or load a smaller graph");
    await expect(readStateGraphBlob(gzip, 512)).rejects.toThrow("viewer limit");
  });

  it("cancels and releases an oversized input stream", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) { controller.enqueue(new Uint8Array(513)); },
      cancel,
    });
    const blob = new Blob(["{}"]);
    vi.spyOn(blob, "stream").mockReturnValue(stream);
    await expect(readStateGraphBlob(blob, 512)).rejects.toThrow("viewer limit");
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });

  it("accepts input exactly at the byte limit", async () => {
    const blob = new Blob([JSON.stringify(checkpoint)]);
    expect(await readStateGraphBlob(blob, blob.size)).toEqual(coerceStateGraph(graph));
  });

  it("reports invalid JSON and rejects broken gzip", async () => {
    expect((await readStateGraphBlob(new Blob(["not json"]))).issues[0].message).toContain("Invalid JSON");
    await expect(readStateGraphBlob(new Blob([new Uint8Array([0x1f, 0x8b, 0])]))).rejects.toThrow();
  });

  it("fetches only the authenticated same-origin artifact endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(checkpoint)));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    expect(await fetchSnapshotGraph(log, artifact, signal)).toEqual(coerceStateGraph(graph));
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/raidlogs/logs/${log}/artifacts/${artifact}/download`, { credentials: "same-origin", signal });
    expect(() => snapshotDownloadURL("https://elsewhere.test", artifact)).toThrow("valid log and artifact IDs");
  });

  it.each([401, 403, 404])("surfaces download failure %s rather than displaying a default graph", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("denied", { status })));
    await expect(fetchSnapshotGraph(log, artifact)).rejects.toThrow(`Unable to load snapshot (${status})`);
  });
});
