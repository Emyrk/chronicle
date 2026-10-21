import type { PlanItem, PlanPoint } from "../plan/mapPlan";
import type { RaidGuide, RaidGuideRole, RaidGuideUnit } from "./raidGuideModel";

const MAP_ID = 249;
const ARENA_Y_OFFSET = -43;
const ONYXIA = { x: -18, y: -214 } satisfies PlanPoint;
const NORTH = { x: 32, y: -214 } satisfies PlanPoint;
const ENTRANCE = { x: -92, y: -214 } satisfies PlanPoint;
const LEFT_PIT = { x: -61, y: -169 } satisfies PlanPoint;
const RIGHT_PIT = { x: -61, y: -259 } satisfies PlanPoint;

// The first pass was authored around a zeroed arena centre. Translate those
// readable local coordinates onto Onyxia's recorded room-space y coordinate.
const point = (x: number, y: number): PlanPoint => ({ x, y: y + ARENA_Y_OFFSET });
const item = <T extends PlanItem>(value: T): T => value;

function unit(id: string, name: string, role: RaidGuideRole, at: PlanPoint, facing?: number, entry?: number): RaidGuideUnit {
  return { id, name, role, at, ...(facing === undefined ? {} : { facing }), ...(entry === undefined ? {} : { entry }) };
}

function roleLine(prefix: string, role: RaidGuideRole, count: number, from: PlanPoint, to: PlanPoint): RaidGuideUnit[] {
  return Array.from({ length: count }, (_, index) => {
    const amount = count === 1 ? 0.5 : index / (count - 1);
    return unit(
      `${prefix}-${index + 1}`,
      `${role[0].toUpperCase()}${role.slice(1)} ${index + 1}`,
      role,
      point(from.x + (to.x - from.x) * amount, from.y + (to.y - from.y) * amount),
    );
  });
}

function roleArc(prefix: string, role: RaidGuideRole, count: number, centre: PlanPoint, radius: number, start: number, end: number): RaidGuideUnit[] {
  return Array.from({ length: count }, (_, index) => {
    const amount = count === 1 ? 0.5 : index / (count - 1);
    const angle = start + (end - start) * amount;
    return unit(
      `${prefix}-${index + 1}`,
      `${role[0].toUpperCase()}${role.slice(1)} ${index + 1}`,
      role,
      point(centre.x + Math.cos(angle) * radius, centre.y + Math.sin(angle) * radius),
      angle + Math.PI,
    );
  });
}

const boss = (at = ONYXIA, facing = 0) => unit("onyxia", "Onyxia", "boss", at, facing, 10184);
const hatchers = () => [
  unit("hatcher-left", "Onyxian Hatcher", "add", point(-76, -145), 0, 11262),
  unit("hatcher-right", "Onyxian Hatcher", "add", point(-76, -198), 0, 11262),
];

const safeFlanks = [
  ...roleLine("melee-left", "melee", 5, point(-7, -145), point(-35, -143)),
  ...roleLine("melee-right", "melee", 5, point(-7, -197), point(-35, -199)),
  ...roleLine("ranged-left", "ranged", 5, point(-11, -128), point(-51, -125)),
  ...roleLine("ranged-right", "ranged", 5, point(-11, -214), point(-51, -217)),
  ...roleLine("healers", "healer", 5, point(-19, -135), point(-19, -207)),
];

const phaseOneCorrect = [
  boss(),
  unit("main-tank", "Main Tank", "tank", NORTH, Math.PI),
  unit("off-tank", "Off Tank", "tank", point(19, -180), Math.PI),
  ...safeFlanks,
];

const phaseOneWrong = [
  boss(ONYXIA, Math.PI),
  unit("main-tank", "Main Tank", "tank", point(-34, -171), 0),
  unit("off-tank", "Off Tank", "tank", point(-22, -167), 0),
  ...roleArc("raid-stack", "melee", 8, ONYXIA, 12, -0.55, 0.55),
  ...roleArc("ranged-stack", "ranged", 9, point(-36, -171), 15, -0.45, 0.45),
  ...roleLine("healers", "healer", 5, point(-44, -163), point(-44, -179)),
];

const spreadAirRaid = [
  boss(point(-5, -171), Math.PI / 2),
  unit("air-drake", "Air-phase Drake", "add", point(-52, -171), 0),
  ...roleLine("melee-whelps-left", "melee", 4, point(-48, -136), point(-66, -137)),
  ...roleLine("melee-whelps-right", "melee", 4, point(-48, -206), point(-66, -205)),
  ...roleLine("ranged-north", "ranged", 6, point(11, -133), point(11, -209)),
  ...roleLine("ranged-south", "ranged", 4, point(-38, -145), point(-38, -197)),
  ...roleLine("healers-air", "healer", 5, point(-13, -132), point(-13, -210)),
  unit("add-tank-left", "Whelp Tank", "tank", point(-54, -132), -Math.PI / 2),
  unit("add-tank-right", "Whelp Tank", "tank", point(-54, -210), Math.PI / 2),
];

const stackedAirRaid = [
  boss(point(-5, -171), Math.PI / 2),
  unit("air-drake", "Air-phase Drake", "add", point(-24, -171), 0),
  ...roleArc("raid-stack", "ranged", 12, point(-11, -171), 10, 0, Math.PI * 2),
  ...roleArc("melee-stack", "melee", 8, point(-27, -171), 8, 0, Math.PI * 2),
  ...roleLine("healers-stack", "healer", 5, point(-16, -166), point(-16, -176)),
  unit("lonely-tank", "Whelp Tank", "tank", point(-59, -131), -Math.PI / 2),
];

const landingCorrect = [
  boss(point(-4, -171), 0),
  unit("main-tank", "Main Tank", "tank", point(26, -171), Math.PI),
  unit("hatcher-tank", "Hatcher Tank", "tank", point(-72, -171), 0),
  ...hatchers(),
  ...roleLine("melee-boss", "melee", 6, point(-8, -145), point(-31, -145)),
  ...roleLine("ranged-boss", "ranged", 6, point(-5, -204), point(-38, -207)),
  ...roleLine("add-team", "melee", 4, point(-66, -153), point(-66, -190)),
  ...roleLine("healers", "healer", 5, point(-29, -135), point(-29, -207)),
];

const landingWrong = [
  boss(point(-20, -171), Math.PI),
  unit("main-tank", "Main Tank", "tank", point(-37, -171), 0),
  ...hatchers(),
  ...roleArc("raid-tail", "melee", 10, point(-12, -171), 13, -0.4, 0.4),
  ...roleArc("raid-front", "ranged", 10, point(-30, -171), 16, Math.PI - 0.4, Math.PI + 0.4),
  ...roleLine("healers", "healer", 5, point(-44, -163), point(-44, -179)),
];

export const ONYXIA_GUIDE: RaidGuide = {
  slug: "onyxia-turtle-wow",
  encounter: "Onyxia",
  instance: "Onyxia's Lair",
  server: "Turtle WoW",
  difficulty: "40-player raid · strategy prototype",
  chapters: [
    {
      id: "briefing",
      eyebrow: "Before the pull",
      title: "Give every group a side",
      summary: "Build the room around three jobs: hold Onyxia at the north wall, keep the raid on her flanks, and reserve the entrance half for add control.",
      duration: "45 sec",
      objectives: [
        "Assign three to four tank jobs: Onyxia, the air-phase drake, and both landing adds.",
        "Split melee, ranged, and healers across both flanks.",
        "Keep the centre lane readable for breaths and movement.",
      ],
      correct: {
        units: phaseOneCorrect,
        planItems: [
          item({ id: "briefing-north", kind: "text", at: point(37, -171), text: "NORTH WALL", color: "#facc15" }),
          item({ id: "briefing-left", kind: "circle", at: point(-20, -146), radius: 17, color: "#22c55e" }),
          item({ id: "briefing-right", kind: "circle", at: point(-20, -197), radius: 17, color: "#22c55e" }),
          item({ id: "briefing-centre", kind: "arrow", points: [ENTRANCE, NORTH], color: "#f5f5f4" }),
          item({ id: "briefing-lane", kind: "text", at: point(-43, -171), text: "KEEP THIS LANE CLEAR", color: "#f5f5f4" }),
        ],
        callout: "The room should look deliberately empty through the middle. That space becomes your warning system later.",
      },
      wrong: {
        units: phaseOneWrong,
        planItems: [
          item({ id: "briefing-bad-stack", kind: "circle", at: point(-30, -171), radius: 22, color: "#ef4444" }),
          item({ id: "briefing-bad-text", kind: "text", at: point(-51, -171), text: "NO GROUP ASSIGNMENTS", color: "#ef4444" }),
        ],
        callout: "One loose stack creates tail swipes, breath hits, healer overlap, and no obvious path when the fight changes phase.",
      },
    },
    {
      id: "phase-one",
      eyebrow: "Phase 1",
      title: "Flanks are safe, front and tail are not",
      summary: "The main tank points Onyxia into the north wall. Everyone else forms two shallow wings beside her ribcage, never a stack behind her tail.",
      duration: "100% → 65%",
      objectives: [
        "Let the tank settle Onyxia before damage starts.",
        "Melee attack from the rear flanks, not directly behind her.",
        "Ranged and healers mirror each other with room to adjust.",
      ],
      correct: {
        units: phaseOneCorrect,
        planItems: [
          item({ id: "p1-front", kind: "cone", at: ONYXIA, radius: 43, width: 65, facing: 0, color: "#ef4444" }),
          item({ id: "p1-tail", kind: "cone", at: ONYXIA, radius: 38, width: 55, facing: Math.PI, color: "#ef4444" }),
          item({ id: "p1-left", kind: "circle", at: point(-19, -146), radius: 16, color: "#22c55e" }),
          item({ id: "p1-right", kind: "circle", at: point(-19, -197), radius: 16, color: "#22c55e" }),
          item({ id: "p1-tank", kind: "text", at: point(34, -171), text: "TANK", color: "#facc15" }),
        ],
        callout: "Think wings, not a semicircle. Nobody needs to cross the dragon's front or tail to reach their assignment.",
      },
      wrong: {
        units: phaseOneWrong,
        planItems: [
          item({ id: "p1-wrong-breath", kind: "cone", at: ONYXIA, radius: 48, width: 75, facing: Math.PI, color: "#ef4444" }),
          item({ id: "p1-wrong-tail", kind: "cone", at: ONYXIA, radius: 42, width: 65, facing: 0, color: "#ef4444" }),
          item({ id: "p1-wrong-stack", kind: "circle", at: point(-34, -171), radius: 21, color: "#ef4444" }),
          item({ id: "p1-wrong-text", kind: "text", at: point(-55, -171), text: "TAIL + BREATH OVERLAP", color: "#ef4444" }),
        ],
        callout: "Turning Onyxia into the raid makes every correction worse. The tank re-centres first; the raid does not chase the boss through her hitbox.",
      },
    },
    {
      id: "air-phase",
      eyebrow: "Phase 2",
      title: "Kill the drake before the landing",
      summary: "Onyxia takes the air with a new dragonkin add. An off-tank holds it for melee while ranged pressure Onyxia and the raid controls both whelp sides.",
      duration: "65% → 40%",
      objectives: [
        "Assign one off-tank and melee to the new drake immediately.",
        "Control both whelp sides without building a raid-wide stack.",
        "Stop damage on Onyxia if the drake is still alive near 40%.",
      ],
      correct: {
        units: spreadAirRaid,
        planItems: [
          item({ id: "p2-left-pit", kind: "circle", at: LEFT_PIT, radius: 12, color: "#f97316" }),
          item({ id: "p2-right-pit", kind: "circle", at: RIGHT_PIT, radius: 12, color: "#f97316" }),
          item({ id: "p2-left-arrow", kind: "arrow", points: [LEFT_PIT, point(-51, -141)], color: "#22c55e" }),
          item({ id: "p2-right-arrow", kind: "arrow", points: [RIGHT_PIT, point(-51, -202)], color: "#22c55e" }),
          item({ id: "p2-spread", kind: "text", at: point(15, -171), text: "SPREAD FOR FIREBALLS", color: "#3b82f6" }),
          item({ id: "p2-centre", kind: "rect", from: point(24, -181), to: point(-61, -161), color: "#f5f5f4" }),
        ],
        callout: "The fake raid shows controlled whelp pockets and a spread ranged line. The melee team should be on the new drake, which must die before Onyxia lands.",
      },
      wrong: {
        units: stackedAirRaid,
        planItems: [
          item({ id: "p2-bad-stack", kind: "circle", at: point(-16, -171), radius: 19, color: "#ef4444" }),
          item({ id: "p2-open-pit", kind: "circle", at: RIGHT_PIT, radius: 14, color: "#ef4444" }),
          item({ id: "p2-bad-line", kind: "arrow", points: [RIGHT_PIT, point(-19, -171)], color: "#ef4444" }),
          item({ id: "p2-bad-text", kind: "text", at: point(-48, -191), text: "UNCONTROLLED WHELPS", color: "#ef4444" }),
        ],
        callout: "A centre stack gives fireballs and loose whelps the same target. It also hides Onyxia's line until the breath is already committed.",
      },
    },
    {
      id: "deep-breath",
      eyebrow: "Phase 2 reaction",
      title: "Move sideways, never race the breath",
      summary: "When Onyxia lines up the room, leave the projected lane at a right angle. The guide can freeze the correct and failed reactions on the same terrain.",
      duration: "Reaction check",
      objectives: [
        "Watch Onyxia's position and turn before the cast completes.",
        "Exit through the closest side of the lane.",
        "Do not run along the breath path or cross back through it.",
      ],
      correct: {
        units: spreadAirRaid.map((entry) => entry.id === "onyxia" ? { ...entry, at: point(-19, -118), facing: -Math.PI / 2 } : entry),
        planItems: [
          item({ id: "breath-lane", kind: "rect", from: point(-4, -126), to: point(-40, -218), color: "#ef4444" }),
          item({ id: "breath-left-exit", kind: "arrow", points: [point(-18, -157), point(-18, -136)], color: "#22c55e" }),
          item({ id: "breath-right-exit", kind: "arrow", points: [point(-19, -186), point(-19, -207)], color: "#22c55e" }),
          item({ id: "breath-label", kind: "text", at: point(-44, -171), text: "CROSS THE EDGE", color: "#22c55e" }),
        ],
        callout: "The shortest safe movement is perpendicular to the lane. Pick the closer edge and commit immediately.",
      },
      wrong: {
        units: stackedAirRaid.map((entry) => entry.id === "onyxia" ? { ...entry, at: point(-19, -118), facing: -Math.PI / 2 } : entry),
        planItems: [
          item({ id: "breath-lane", kind: "rect", from: point(-4, -126), to: point(-40, -218), color: "#ef4444" }),
          item({ id: "breath-run", kind: "arrow", points: [point(-18, -153), point(-36, -194)], color: "#ef4444" }),
          item({ id: "breath-stack", kind: "circle", at: point(-17, -171), radius: 17, color: "#ef4444" }),
          item({ id: "breath-label", kind: "text", at: point(-47, -191), text: "RUNNING WITH THE BREATH", color: "#ef4444" }),
        ],
        callout: "Running down the lane keeps the raid inside the hazard for longer. A late stack also blocks players trying to take the nearest exit.",
      },
    },
    {
      id: "landing",
      eyebrow: "Phase 3",
      title: "Separate the hatchers, then burn",
      summary: "Onyxia lands with two hard-hitting hatchers. Each gets its own tank and kill zone while the raid moves out of Rain of Fire and controls fresh whelps.",
      duration: "40% → kill",
      objectives: [
        "Give the main tank time to point Onyxia north again.",
        "Tank the two hatchers apart and move every Rain of Fire immediately.",
        "Kill the adds, control whelps, then return damage to Onyxia.",
      ],
      correct: {
        units: landingCorrect,
        planItems: [
          item({ id: "p3-boss-zone", kind: "circle", at: point(-10, -171), radius: 38, color: "#22c55e" }),
          item({ id: "p3-add-zone", kind: "circle", at: point(-73, -171), radius: 24, color: "#f97316" }),
          item({ id: "p3-rain-left", kind: "circle", at: point(-76, -145), radius: 10, color: "#ef4444" }),
          item({ id: "p3-rain-right", kind: "circle", at: point(-76, -198), radius: 10, color: "#ef4444" }),
          item({ id: "p3-separator", kind: "arrow", points: [point(-52, -128), point(-52, -216)], color: "#f5f5f4" }),
          item({ id: "p3-add-label", kind: "text", at: point(-84, -171), text: "ADD CONTROL", color: "#f97316" }),
        ],
        callout: "Treat the landing as a second pull. Separate both hatchers, step out of Rain of Fire, kill the add priority, then spend cooldowns on Onyxia.",
      },
      wrong: {
        units: landingWrong,
        planItems: [
          item({ id: "p3-bad-front", kind: "cone", at: point(-20, -171), radius: 45, width: 75, facing: Math.PI, color: "#ef4444" }),
          item({ id: "p3-bad-tail", kind: "cone", at: point(-20, -171), radius: 40, width: 65, facing: 0, color: "#ef4444" }),
          item({ id: "p3-adds-loose", kind: "circle", at: point(-75, -171), radius: 28, color: "#ef4444" }),
          item({ id: "p3-bad-label", kind: "text", at: point(-52, -171), text: "BOSS + ADDS + RAID", color: "#ef4444" }),
        ],
        callout: "Chasing damage during the landing mixes the dragon, adds, and raid in one lane. Fear or a tail swipe then turns a recoverable transition into a wipe.",
      },
    },
  ],
};

export const ONYXIA_MAP_ID = MAP_ID;
