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
        description: "Tank-oriented Feral builds that meet every required talent marker.",
      },
      {
        name: "Cat",
        description: "All other Feral builds, including builds missing any Bear marker.",
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
]

export function subspecRulesForFlavor(flavor: readonly string[]): readonly SubspecRule[] {
  return SUBSPEC_RULES.filter((rule) => flavor.includes(rule.flavor))
}
