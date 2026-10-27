import { readVarint, readVarint64 } from "@/api/protodecode/decode"

export const MAX_PREVIEW_STREAM_BYTES = 32_000_000
export const MAX_PREVIEW_SELECTED_BYTES = 8_000_000
export const MAX_PREVIEW_ENCOUNTERS = 3
const MAX_PREVIEW_EVENTS = 50_000

/** Keep only selected, complete framed encounters before sending bytes to the Lua worker. */
export function boundPreviewDamage(data: Uint8Array, encounterIds: readonly string[]): Uint8Array {
  if (data.byteLength > MAX_PREVIEW_STREAM_BYTES) throw new Error("Damage stream exceeds preview input limit")
  if (!encounterIds.length || encounterIds.length > MAX_PREVIEW_ENCOUNTERS ||
    encounterIds.some(id => !id || id.length > 256) || new Set(encounterIds).size !== encounterIds.length) {
    throw new Error(`Select 1 to ${MAX_PREVIEW_ENCOUNTERS} distinct encounters`)
  }
  const selected = new Set(encounterIds)
  const chunks: Uint8Array[] = []
  const found = new Set<string>()
  let offset = 0
  let bytes = 0
  let events = 0
  const decoder = new TextDecoder("utf-8", { fatal: true })
  while (offset < data.length) {
    const start = offset
    const idLength = readVarint(data, offset)
    offset += idLength.bytesRead
    if (idLength.value > 256 || offset + idLength.value > data.length) throw new Error("Invalid encounter frame")
    const id = decoder.decode(data.subarray(offset, offset + idLength.value))
    offset += idLength.value
    offset += readVarint64(data, offset).bytesRead
    const count = readVarint(data, offset)
    offset += count.bytesRead
    const length = readVarint(data, offset)
    offset += length.bytesRead
    if (!Number.isSafeInteger(length.value) || length.value < 0 || offset + length.value > data.length) throw new Error("Invalid encounter frame")
    offset += length.value
    if (!selected.has(id)) continue
    if (found.has(id)) throw new Error("Duplicate encounter frame")
    found.add(id)
    bytes += offset - start
    events += count.value
    if (bytes > MAX_PREVIEW_SELECTED_BYTES || events > MAX_PREVIEW_EVENTS) throw new Error("Selected encounters exceed preview limit")
    chunks.push(data.subarray(start, offset))
  }
  if (found.size !== selected.size) throw new Error("Selected encounter data is unavailable")
  const output = new Uint8Array(bytes)
  let position = 0
  for (const chunk of chunks) { output.set(chunk, position); position += chunk.length }
  return output
}
