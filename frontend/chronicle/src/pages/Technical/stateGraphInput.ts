import { parseStateGraph, type ParseResult } from "./stateGraph";

// Browser inspection deliberately supports less than the backend's 256 MiB
// checkpoint cap: JSON parsing and graph indexing create additional copies.
// Both downloaded input and decompressed JSON are limited to 32 MiB.
export const MAX_STATE_GRAPH_BYTES = 32 * 1024 * 1024;

async function boundedBlob(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Blob> {
  const reader = stream.getReader();
  const chunks: ArrayBuffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return new Blob(chunks);
      size += value.byteLength;
      if (size > maxBytes) {
        throw new Error(`Snapshot exceeds the viewer limit of ${maxBytes / (1024 * 1024)} MiB. Inspect this snapshot offline or load a smaller graph.`);
      }
      // Copy only chunks inside the budget; never accumulate the oversized tail.
      chunks.push(new Uint8Array(value).buffer);
    }
  } finally {
    // On overflow this cancels the decompressor and its upstream input too.
    try { await reader.cancel(); } catch { /* Preserve the original read error. */ }
    reader.releaseLock();
  }
}

/** Detect gzip by bytes, not extension or HTTP headers (fetch may already decode it). */
export async function readStateGraphBlob(blob: Blob, maxBytes = MAX_STATE_GRAPH_BYTES): Promise<ParseResult> {
  const magic = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  const stream = magic[0] === 0x1f && magic[1] === 0x8b
    ? blob.stream().pipeThrough(new DecompressionStream("gzip"))
    : blob.stream();
  const bounded = await boundedBlob(stream, maxBytes);
  return parseStateGraph(await bounded.text());
}

export function snapshotDownloadURL(logId: string, artifactId: string): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(logId) || !uuid.test(artifactId)) throw new Error("Snapshot link requires valid log and artifact IDs");
  return `/api/v1/raidlogs/logs/${logId}/artifacts/${artifactId}/download`;
}

/** Authorization is enforced by the existing admin-only artifact endpoint. */
export async function fetchSnapshotGraph(logId: string, artifactId: string, signal?: AbortSignal): Promise<ParseResult> {
  const response = await fetch(snapshotDownloadURL(logId, artifactId), { credentials: "same-origin", signal });
  if (!response.ok) throw new Error(`Unable to load snapshot (${response.status}). Administrator access is required.`);
  if (!response.body) throw new Error("Snapshot download returned an empty body");
  return readStateGraphBlob(await boundedBlob(response.body, MAX_STATE_GRAPH_BYTES));
}
