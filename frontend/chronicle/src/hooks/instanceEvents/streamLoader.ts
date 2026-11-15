import { decompressGzip, isGzipped, readVarint, readVarint64, type PayloadHeader } from "@/api/protodecode/decode";
import type { CachedStream, StreamType } from "./types";

/**
 * Get the API endpoint for a stream type
 */
function getStreamEndpoint(instanceId: string, type: StreamType): string {
  return `/api/v1/raidlogs/instances/${instanceId}/events/${type}`;
}

/**
 * Parse all encounter headers from stream data without fully decoding messages.
 * This gives us the header info for progress tracking.
 */
function parseAllHeaders(data: Uint8Array): PayloadHeader[] {
  const headers: PayloadHeader[] = [];
  let offset = 0;

  while (offset < data.length) {
    // Read encounterID (length-prefixed string)
    const { value: strLen, bytesRead: strLenBytes } = readVarint(data, offset);
    offset += strLenBytes;
    const encounterID = new TextDecoder().decode(data.subarray(offset, offset + strLen));
    offset += strLen;

    // Read firstTimestamp (varint, milliseconds since epoch)
    const { value: timestampMs, bytesRead: tsBytes } = readVarint64(data, offset);
    offset += tsBytes;
    const firstTimestamp = new Date(Number(timestampMs));

    // Read count (varint)
    const { value: count, bytesRead: countBytes } = readVarint(data, offset);
    offset += countBytes;

    // Read dataLength (varint)
    const { value: dataLength, bytesRead: dataLenBytes } = readVarint(data, offset);
    offset += dataLenBytes;

    headers.push({
      encounterID,
      firstTimestamp,
      count,
      dataLength,
    });

    // Skip message data to get to next header
    offset += dataLength;
  }

  return headers;
}

export async function loadInstanceStream(instanceId: string, type: StreamType, signal: AbortSignal): Promise<CachedStream> {
  const response = await fetch(getStreamEndpoint(instanceId, type), { signal });
  signal.throwIfAborted();
  if (response.status === 404) return { data: new Uint8Array(0), headers: [] };
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
  }
  if ((response.headers.get("content-type") || "").includes("application/json")) {
    throw new Error(`Server error: ${JSON.stringify(await response.json())}`);
  }
  const buffer = await response.arrayBuffer();
  signal.throwIfAborted();
  let data = new Uint8Array(buffer);
  if (isGzipped(data)) data = await decompressGzip(data);
  signal.throwIfAborted();
  return { data, headers: parseAllHeaders(data) };
}
