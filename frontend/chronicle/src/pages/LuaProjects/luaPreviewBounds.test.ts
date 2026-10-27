import { describe, expect, it } from "vitest"
import { selectPreviewDamage } from "./luaPreviewBounds"

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

describe("unsaved Lua preview encounter selection", () => {
  it("copies only selected frames, not unrelated instance encounters", () => {
    const a = frame("a", 1, new Uint8Array([3]))
    const b = frame("b", 2, new Uint8Array([4]))
    const source = concat(a, b)
    const selected = selectPreviewDamage(source, ["b"])
    expect(selected).toEqual(b)
    source.fill(0)
    expect(selected).toEqual(b)
  })
  it("keeps every encounter for stream_scope instance, still requiring the selection", () => {
    const a = frame("a", 1, new Uint8Array([3]))
    const b = frame("b", 2, new Uint8Array([4]))
    expect(selectPreviewDamage(concat(a, b), ["b"], "instance")).toEqual(concat(a, b))
    expect(() => selectPreviewDamage(a, ["b"], "instance")).toThrow(/unavailable/)
  })
  it("passes large selections and event counts through without a host cap", () => {
    const frames = ["a", "b", "c", "d", "e"].map(id => frame(id, 1_000_000, new Uint8Array(4)))
    expect(selectPreviewDamage(concat(...frames), ["a", "b", "c", "d", "e"])).toEqual(concat(...frames))
  })
  it("rejects missing, duplicate and malformed encounter data", () => {
    expect(() => selectPreviewDamage(frame("a", 1), [])).toThrow(/Select/)
    expect(() => selectPreviewDamage(frame("a", 1), ["a", "a"])).toThrow(/Select/)
    expect(() => selectPreviewDamage(frame("a", 1), ["b"])).toThrow(/unavailable/)
    expect(() => selectPreviewDamage(concat(frame("a", 1), frame("a", 1)), ["a"])).toThrow(/Duplicate/)
    expect(() => selectPreviewDamage(new Uint8Array([1, 97, 1, 0, 5]), ["a"])).toThrow(/Invalid/)
  })
})
