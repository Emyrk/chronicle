import { beforeEach, describe, expect, it, vi } from "vitest"
import { readPreviewSelection, restoredEncounters, writePreviewSelection } from "./previewSelection"

describe("preview selection", () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) })
  })

  it("round-trips per module and ignores malformed values", () => {
    writePreviewSelection("p1", { instanceId: "i1", encounterIds: ["e1", "e2"] })
    expect(readPreviewSelection("p1")).toEqual({ instanceId: "i1", encounterIds: ["e1", "e2"] })
    expect(readPreviewSelection("p2")).toBeNull()
    localStorage.setItem("lua-workshop-preview:p3", "{nope")
    expect(readPreviewSelection("p3")).toBeNull()
    localStorage.setItem("lua-workshop-preview:p4", JSON.stringify({ instanceId: "i4", encounterIds: ["e1", 5] }))
    expect(readPreviewSelection("p4")).toEqual({ instanceId: "i4", encounterIds: ["e1"] })
  })

  it("keeps only encounters that still exist, in instance order", () => {
    expect(restoredEncounters(["e3", "gone", "e1"], [{ id: "e1" }, { id: "e2" }, { id: "e3" }])).toEqual(["e1", "e3"])
  })
})
