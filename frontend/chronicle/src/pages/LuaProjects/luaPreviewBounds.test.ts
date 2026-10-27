import { describe, expect, it } from "vitest"
import { boundPreviewDamage, MAX_PREVIEW_SELECTED_BYTES, MAX_PREVIEW_STREAM_BYTES } from "./luaPreviewBounds"

function varint(value: number): number[] {
  const bytes: number[] = []
  do { const byte = value % 128; value = Math.floor(value / 128); bytes.push(byte | (value ? 128 : 0)) } while (value)
  return bytes
}
function frame(id: string, count: number, data = new Uint8Array()): Uint8Array {
  return new Uint8Array([...varint(id.length), ...new TextEncoder().encode(id), ...varint(1), ...varint(count), ...varint(data.length), ...data])
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) { result.set(part, offset); offset += part.length }
  return result
}

describe("unsaved Lua preview encounter bounds", () => {
  it("copies only selected frames, not unrelated instance encounters", () => {
    const a = frame("a", 1, new Uint8Array([3]))
    const b = frame("b", 2, new Uint8Array([4]))
    const source = concat(a, b)
    const selected = boundPreviewDamage(source, ["b"])
    expect(selected).toEqual(b)
    source.fill(0)
    expect(selected).toEqual(b)
  })
  it("keeps every encounter for stream_scope instance, still requiring the selection", () => {
    const a = frame("a", 1, new Uint8Array([3]))
    const b = frame("b", 2, new Uint8Array([4]))
    expect(boundPreviewDamage(concat(a, b), ["b"], "instance")).toEqual(concat(a, b))
    expect(() => boundPreviewDamage(a, ["b"], "instance")).toThrow(/unavailable/)
    expect(() => boundPreviewDamage(concat(frame("a", 30_000), frame("b", 30_000)), ["b"], "instance")).toThrow(/stream_scope "instance"/)
  })
  it("rejects missing, duplicate, excessive and malformed encounter data", () => {
    expect(() => boundPreviewDamage(frame("a", 1), [])).toThrow(/Select/)
    expect(() => boundPreviewDamage(frame("a", 1), ["a", "a"])).toThrow(/distinct/)
    expect(() => boundPreviewDamage(frame("a", 1), ["a", "b", "c", "d"])).toThrow(/Select/)
    expect(() => boundPreviewDamage(frame("a", 1), ["b"])).toThrow(/unavailable/)
    expect(() => boundPreviewDamage(concat(frame("a", 1), frame("a", 1)), ["a"])).toThrow(/Duplicate/)
    expect(() => boundPreviewDamage(frame("a", 50_001), ["a"])).toThrow(/limit/)
    expect(() => boundPreviewDamage(new Uint8Array([1, 97, 1, 0, 5]), ["a"])).toThrow(/Invalid/)
  })
  it("rejects oversized selected payloads and oversized provider input", () => {
    expect(() => boundPreviewDamage(frame("a", 1, new Uint8Array(MAX_PREVIEW_SELECTED_BYTES)), ["a"])).toThrow(/limit/)
    expect(() => boundPreviewDamage(new Uint8Array(MAX_PREVIEW_STREAM_BYTES + 1), ["a"])).toThrow(/input limit/)
  })
})
