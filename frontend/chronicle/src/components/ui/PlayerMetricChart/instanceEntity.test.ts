import { describe, expect, it } from "vitest"
import type { Instance } from "@/pages/Instance/InstancePage"
import { getArmoryUrl, instanceCharacterEntity, instanceEntityAttributes, instanceRowEntity, isInstancePlayerFavorite } from "./instanceEntity"

describe("getArmoryUrl", () => {
  it("uses the player GUID instead of the character name", () => {
    const playerGuid = "0x000000000008C9B8"
    const instance = {
      realm: "ChromieCraft",
      players: {
        [playerGuid]: {
          name: "Axm",
          class: "WARRIOR",
          race: "HUMAN",
          level: 22,
        },
      },
    } as unknown as Instance

    expect(getArmoryUrl(instance, playerGuid)).toBe(
      "/armory/ChromieCraft/0x000000000008C9B8",
    )
  })
})


describe("participant realm actions", () => {
  const homeRealm = "11111111-1111-4111-8111-111111111111"
  const otherRealm = "22222222-2222-4222-8222-222222222222"
  const instance = {
    realm: "Instance Realm",
    players: {
      home: { name: "Same", class: "MAGE", realm_id: homeRealm },
      other: { name: "Same", class: "MAGE", realm_id: otherRealm },
      unknown: { name: "Unknown", class: "MAGE", realm_id: null },
      legacy: { name: "Legacy", class: "MAGE" },
    },
  } as unknown as Instance

  it.each([
    ["home", homeRealm], ["other", otherRealm],
    ["unknown", "Instance Realm"], ["legacy", "Instance Realm"],
  ])("uses the effective realm for %s links and Alt entities", (guid, realm) => {
    expect(getArmoryUrl(instance, guid)).toBe(`/armory/${encodeURIComponent(realm)}/${guid}`)
    expect(instanceCharacterEntity(instance, guid)).toMatchObject({ realm, guid })
    expect(JSON.stringify(instanceEntityAttributes(instance, guid))).toContain(realm)
    expect(instanceRowEntity(instance)({ playerID: guid, playerName: "Same", className: "MAGE" } as Parameters<ReturnType<typeof instanceRowEntity>>[0])).toMatchObject({ realm, guid })
  })

  it("does not create player actions for pets, NPCs or absent GUIDs", () => {
    expect(getArmoryUrl(instance, "pet")).toBeUndefined()
    expect(instanceCharacterEntity(instance, "npc")).toBeUndefined()
    expect(instanceEntityAttributes(instance, undefined)).toEqual({})
  })

  it("uses known player realms even without an instance realm", () => {
    expect(getArmoryUrl({ ...instance, realm: "" }, "home")).toBe(`/armory/${homeRealm}/home`)
    expect(getArmoryUrl({ ...instance, realm: "" }, "unknown")).toBeUndefined()
  })

  it("matches favorite GUID and realm without falling back from known home realms", () => {
    const favorites = [{ id: "home", realm_id: otherRealm, realm_name: "Instance Realm" }]
    expect(isInstancePlayerFavorite(instance, "home", favorites)).toBe(false)
    expect(isInstancePlayerFavorite(instance, "home", [{ ...favorites[0], realm_id: homeRealm }])).toBe(true)
    expect(isInstancePlayerFavorite(instance, "other", [{ ...favorites[0], realm_id: homeRealm }])).toBe(false)
    for (const guid of ["unknown", "legacy"]) {
      expect(isInstancePlayerFavorite(instance, guid, [{ ...favorites[0], id: guid }])).toBe(true)
    }
    expect(isInstancePlayerFavorite(instance, "pet", favorites)).toBe(false)
  })
})
