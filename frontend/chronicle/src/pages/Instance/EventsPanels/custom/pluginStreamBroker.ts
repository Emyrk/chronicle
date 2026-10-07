import type { CachedStream, StreamType } from "@/hooks/instanceEvents";
import type { PluginEventStreamV1 } from "./pluginTypes";

export async function copyPluginStream(
  type: StreamType,
  declaredStreams: readonly StreamType[],
  fetchStream: (type: StreamType) => Promise<CachedStream>,
  signal: AbortSignal,
): Promise<PluginEventStreamV1> {
  if (!declaredStreams.includes(type)) throw new Error(`Stream ${type} was not declared by this panel.`);
  if (signal.aborted) throw new DOMException("Panel was unmounted", "AbortError");
  const cached = await fetchStream(type);
  if (signal.aborted) throw new DOMException("Panel was unmounted", "AbortError");
  const data = cached.data.slice();
  return {
    type,
    encoding: "chronicle-event-stream-v1",
    data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    headers: cached.headers.map((header) => ({
      encounterId: header.encounterID,
      firstTimestampMs: header.firstTimestamp.getTime(),
      count: header.count,
      dataLength: header.dataLength,
    })),
  };
}
