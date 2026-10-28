import { describe, expect, it } from "vitest"
import { stripEncounters } from "./stripEncounters"

const enc = (id: string, boss: boolean, kill_type: "clean" | "wipe" | "reset" = "clean") =>
  ({ id, name: id, boss, kill_type, start_time: "2026-10-20T20:00:00Z", end_time: "2026-10-20T20:01:00Z" })
const encounters = [enc("boss", true), enc("trash", false), enc("wipe", true, "wipe"), enc("trashWipe", false, "reset")]
const ids = (options: Parameters<typeof stripEncounters>[1]) => stripEncounters(encounters, options).map(e => e.id)

describe("stripEncounters", () => {
  it("shows boss kills by default", () => {
    expect(ids({ trash: false, wipes: false, selectedIds: [] })).toEqual(["boss"])
  })
  it("adds trash and wipes when asked", () => {
    expect(ids({ trash: true, wipes: false, selectedIds: [] })).toEqual(["boss", "trash"])
    expect(ids({ trash: false, wipes: true, selectedIds: [] })).toEqual(["boss", "wipe"])
    expect(ids({ trash: true, wipes: true, selectedIds: [] })).toEqual(["boss", "trash", "wipe", "trashWipe"])
  })
  it("always shows selected encounters", () => {
    expect(ids({ trash: false, wipes: false, selectedIds: ["trashWipe"] })).toEqual(["boss", "trashWipe"])
  })
})
