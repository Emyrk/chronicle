import { describe, expect, it } from "vitest"
import type { LeaderboardConfigurationRow } from "@/api/typesGenerated"
import { awardsForCohort, renownAwardsByInstance } from "./renownConfig"

const row = (r: Partial<LeaderboardConfigurationRow>): LeaderboardConfigurationRow => ({
  kind: "", instance_name: "", encounter_name: "", difficulty_name: "", max_players: 0,
  set_key: "", set_name: "", position: 0, points: 0, has_points: false, ...r,
})

describe("renown configuration", () => {
  it("collects default awards and skips bosses without points", () => {
    const awards = renownAwardsByInstance([
      row({ kind: "instance", instance_name: "Core" }),
      row({ kind: "boss", instance_name: "Core", encounter_name: "A", points: 1, has_points: true }),
      row({ kind: "boss", instance_name: "Core", encounter_name: "B", points: 5, has_points: true }),
      row({ kind: "boss", instance_name: "Core", encounter_name: "Unset" }),
      row({ kind: "instance", instance_name: "Empty" }),
    ])
    expect([...awards.keys()]).toEqual(["Core"])
    expect(awards.get("Core")).toEqual([{ difficulty_name: "", max_players: 0, rules: [
      { encounter_name: "A", points: 1 }, { encounter_name: "B", points: 5 },
    ] }])
  })

  it("keeps variant-only awards and folds variants equal to the default", () => {
    const rows = [
      row({ kind: "instance", instance_name: "Uld" }),
      row({ kind: "variant", instance_name: "Uld", difficulty_name: "10 Player", max_players: 10 }),
      row({ kind: "variant", instance_name: "Uld", difficulty_name: "25 Player", max_players: 25 }),
      row({ kind: "boss", instance_name: "Uld", encounter_name: "Boss" }),
      row({ kind: "boss_variant", instance_name: "Uld", encounter_name: "Boss", difficulty_name: "10 Player", max_players: 10, points: 2, has_points: true }),
      row({ kind: "boss_variant", instance_name: "Uld", encounter_name: "Boss", difficulty_name: "25 Player", max_players: 25, points: 4, has_points: true }),
      row({ kind: "instance", instance_name: "Naxx" }),
      row({ kind: "variant", instance_name: "Naxx", difficulty_name: "Normal", max_players: 40 }),
      row({ kind: "boss", instance_name: "Naxx", encounter_name: "KT", points: 9, has_points: true }),
      row({ kind: "boss_variant", instance_name: "Naxx", encounter_name: "KT", difficulty_name: "Normal", max_players: 40, points: 9, has_points: true }),
    ]
    const awards = renownAwardsByInstance(rows)
    expect(awards.get("Uld")?.map((a) => a.max_players)).toEqual([10, 25])
    expect(awardsForCohort(awards.get("Uld"), "25 Player", 25)?.rules).toEqual([{ encounter_name: "Boss", points: 4 }])
    expect(awardsForCohort(awards.get("Uld"), "Heroic", 25)).toBeUndefined()
    expect(awards.get("Naxx")).toHaveLength(1)
    expect(awardsForCohort(awards.get("Naxx"), "Normal", 40)?.rules).toEqual([{ encounter_name: "KT", points: 9 }])
  })
})
