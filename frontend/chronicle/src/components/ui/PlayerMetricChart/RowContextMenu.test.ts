import { describe, expect, it } from "vitest"
import type { Instance } from "@/pages/Instance/InstancePage"
import { getArmoryUrl } from "./RowContextMenu"

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
