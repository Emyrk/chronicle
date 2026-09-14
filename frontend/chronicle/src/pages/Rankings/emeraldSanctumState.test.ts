import { describe, expect, it } from "vitest"
import {
  emeraldSanctumModeParamForValue,
  getEmeraldSanctumEncounterNames,
  parseEmeraldSanctumMode,
} from "./emeraldSanctumState"

const AVAILABLE_ENCOUNTERS = ["Erennius", "Solnius", "Solnius (Hard Mode)", "Trash"]

describe("Emerald Sanctum ranking mode", () => {
  it("uses Normal as the absent and invalid default", () => {
    expect(parseEmeraldSanctumMode(null)).toBe("normal")
    expect(parseEmeraldSanctumMode("invalid")).toBe("normal")
  })

  it("accepts and serializes Hard Mode", () => {
    expect(parseEmeraldSanctumMode("hard")).toBe("hard")
    expect(emeraldSanctumModeParamForValue("normal")).toBeNull()
    expect(emeraldSanctumModeParamForValue("hard")).toBe("hard")
  })

  it("maps Normal to the normal two-encounter route", () => {
    expect([...getEmeraldSanctumEncounterNames("normal", AVAILABLE_ENCOUNTERS)]).toEqual([
      "Erennius",
      "Solnius",
    ])
  })

  it("maps Hard Mode to the hard two-encounter route", () => {
    expect([...getEmeraldSanctumEncounterNames("hard", AVAILABLE_ENCOUNTERS)]).toEqual([
      "Erennius",
      "Solnius (Hard Mode)",
    ])
  })

  it("never selects unavailable encounters or all three boss variants", () => {
    expect([...getEmeraldSanctumEncounterNames("hard", ["Erennius", "Solnius"])]).toEqual([
      "Erennius",
    ])
    expect(getEmeraldSanctumEncounterNames("normal", AVAILABLE_ENCOUNTERS).size).toBe(2)
    expect(getEmeraldSanctumEncounterNames("hard", AVAILABLE_ENCOUNTERS).size).toBe(2)
  })
})
