import { describe, expect, it } from "vitest"
import {
  DEFAULT_PARSING_PREFS,
  hiddenKey,
  isHidden,
  parseHidden,
  prefsFromParams,
  readParsingPrefs,
  restoreParsingParams,
  setSpecHidden,
  toggleHidden,
} from "./parsingState"

describe("parsing hidden rows", () => {
  it("hides whole classes or exact specs", () => {
    const hidden = parseHidden(`PRIEST,${hiddenKey("WARRIOR", "Protection", "")}`)
    expect(isHidden(hidden, "PRIEST", "Shadow", "")).toBe(true)
    expect(isHidden(hidden, "WARRIOR", "Protection", "")).toBe(true)
    expect(isHidden(hidden, "WARRIOR", "Fury", "Dual Wield")).toBe(false)
  })

  it("toggles keys in a stable order", () => {
    expect(toggleHidden(new Set(["ROGUE"]), "MAGE")).toBe("MAGE,ROGUE")
    expect(toggleHidden(new Set(["ROGUE", "MAGE"]), "MAGE")).toBe("ROGUE")
  })
})

describe("parsing prefs", () => {
  it("survives malformed storage", () => {
    expect(readParsingPrefs("not json")).toEqual(DEFAULT_PARSING_PREFS)
    expect(readParsingPrefs('{"view":"bogus","hidden":{"dps":[1,"MAGE"]}}')).toMatchObject({
      view: "spreads",
      hidden: { dps: ["MAGE"], hps: [] },
    })
  })

  it("restores a bare URL from storage", () => {
    const prefs = {
      ...DEFAULT_PARSING_PREFS,
      view: "spec" as const,
      metric: "hps" as const,
      hidden: { dps: ["PRIEST"], hps: ["ROGUE"] },
      playerClass: "MAGE",
      playerSpec: "Fire",
      bossByInstance: { "Molten Core": "Ragnaros" },
    }
    const restored = restoreParsingParams(new URLSearchParams("instance=Molten+Core"), prefs, "Molten Core")
    expect(restored?.toString()).toBe(
      "instance=Molten+Core&view=spec&metric=hps&hide=ROGUE&class=MAGE&spec=Fire&boss=Ragnaros",
    )
  })

  it("never overrides a shared URL", () => {
    const prefs = { ...DEFAULT_PARSING_PREFS, playerClass: "MAGE" }
    expect(restoreParsingParams(new URLSearchParams("instance=Molten+Core&boss=Garr"), prefs, "Molten Core")).toBeNull()
    expect(restoreParsingParams(new URLSearchParams("instance=Molten+Core"), DEFAULT_PARSING_PREFS, "Molten Core")).toBeNull()
  })

  it("saves hidden rows per metric and boss per instance", () => {
    const prev = { ...DEFAULT_PARSING_PREFS, hidden: { dps: ["PRIEST"], hps: [] }, bossByInstance: { Naxxramas: "Thaddius" } }
    const saved = prefsFromParams(new URLSearchParams("metric=hps&hide=ROGUE&boss=Garr"), prev, "Molten Core")
    expect(saved.hidden).toEqual({ dps: ["PRIEST"], hps: ["ROGUE"] })
    expect(saved.bossByInstance).toEqual({ Naxxramas: "Thaddius", "Molten Core": "Garr" })
  })
})

describe("setSpecHidden", () => {
  it("reveals one spec of a hidden class", () => {
    const keys = [hiddenKey("PRIEST", "Holy", ""), hiddenKey("PRIEST", "Shadow", "")]
    expect(setSpecHidden(new Set(["PRIEST"]), keys, "PRIEST", keys[1], false)).toBe(keys[0])
    expect(setSpecHidden(new Set(), keys, "PRIEST", keys[0], true)).toBe(keys[0])
  })
})
