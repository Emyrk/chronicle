export interface SubspecRule {
  flavor: string
  className: string
  spec: string
  subspecs: readonly {
    name: string
    description: string
  }[]
  detection: readonly string[]
  detectedSubspec: string
  fallback: string
}

const SUBSPEC_RULES: readonly SubspecRule[] = [
  {
    flavor: "nightmare-of-ursol",
    className: "Druid",
    spec: "Feral",
    subspecs: [
      {
        name: "Bear",
        description: "Feral Druids observed in Bear Form for more than 51% of an encounter, or builds that meet every Bear talent marker when neither form qualifies.",
      },
      {
        name: "Cat",
        description: "Feral Druids observed in Cat Form for more than 51% of an encounter, or the talent fallback when neither form qualifies and a Bear marker is missing.",
      },
    ],
    detection: ["Thick Hide", "Feral Charge", "Feral Instinct"],
    detectedSubspec: "Bear",
    fallback: "Cat",
  },
  {
    flavor: "nightmare-of-ursol",
    className: "Shaman",
    spec: "Enhancement",
    subspecs: [
      {
        name: "Tank",
        description: "Tank-oriented Enhancement builds that meet every required talent marker.",
      },
      {
        name: "DPS",
        description: "All other Enhancement builds, including builds missing any Tank marker.",
      },
    ],
    detection: ["Totemic Alignment", "Ancestral Guardian", "Spirit Armor"],
    detectedSubspec: "Tank",
    fallback: "DPS",
  },
  {
    flavor: "nightmare-of-ursol",
    className: "Warrior",
    spec: "Fury",
    subspecs: [
      {
        name: "Fury Prot",
        description: "Fury builds that combine Bloodthirst with Defiance.",
      },
    ],
    detection: ["Defiance", "Bloodthirst"],
    detectedSubspec: "Fury Prot",
    fallback: "",
  },
]

export function subspecRulesForFlavor(flavor: readonly string[]): readonly SubspecRule[] {
  return SUBSPEC_RULES.filter((rule) => flavor.includes(rule.flavor))
}
