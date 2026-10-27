import { readVarint, readVarint64 } from "@/api/protodecode/decode"
import type { PanelStreamScope } from "../Guides/runtime/panelEvents"

/**
 * Keep only complete framed encounters before sending bytes to the Lua worker: the selected ones,
 * or every encounter for panels with stream_scope "instance". There is no size cap; the panel's
 * manifest may set max_events to bound its own replay.
 */
export function selectPreviewDamage(data: Uint8Array, encounterIds: readonly string[], scope: PanelStreamScope = "selection"): Uint8Array {
  if (!encounterIds.length || encounterIds.some(id => !id || id.length > 256) || new Set(encounterIds).size !== encounterIds.length) {
    throw new Error("Select at least one encounter")
  }
  const selected = new Set(encounterIds)
  const chunks: Uint8Array[] = []
  const found = new Set<string>()
  let offset = 0
  let bytes = 0
  const decoder = new TextDecoder("utf-8", { fatal: true })
  while (offset < data.length) {
    const start = offset
    const idLength = readVarint(data, offset)
    offset += idLength.bytesRead
    if (idLength.value > 256 || offset + idLength.value > data.length) throw new Error("Invalid encounter frame")
    const id = decoder.decode(data.subarray(offset, offset + idLength.value))
    offset += idLength.value
    offset += readVarint64(data, offset).bytesRead
    offset += readVarint(data, offset).bytesRead
    const length = readVarint(data, offset)
    offset += length.bytesRead
    if (!Number.isSafeInteger(length.value) || length.value < 0 || offset + length.value > data.length) throw new Error("Invalid encounter frame")
    offset += length.value
    if (!selected.has(id) && scope === "selection") continue
    if (found.has(id)) throw new Error("Duplicate encounter frame")
    found.add(id)
    bytes += offset - start
    chunks.push(data.subarray(start, offset))
  }
  if (encounterIds.some(id => !found.has(id))) throw new Error("Selected encounter data is unavailable")
  const output = new Uint8Array(bytes)
  let position = 0
  for (const chunk of chunks) { output.set(chunk, position); position += chunk.length }
  return output
}
