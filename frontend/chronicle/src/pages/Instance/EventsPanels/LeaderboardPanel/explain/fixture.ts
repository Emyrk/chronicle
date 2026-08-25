import type { SpeedrunProof, SpeedrunResult } from "@/api/typesGenerated";
import { GUID } from "@/lib/guid/guid";
import type { EntitySelection, PanelContext, PanelRenderProps } from "../../types";
import type { Instance } from "../../../InstancePage";
import type { LeaderboardPanelResult } from "../leaderboard.processor";

export const FIXTURE_DURATION_MS = 8_624_000;

function proof(
  name: string,
  category: string,
  satisfied: boolean,
  count = 1,
): SpeedrunProof {
  return {
    requirement: {
      name,
      category,
      count,
      entry_ids: [],
    },
    kills: satisfied
      ? [
          {
            entry_id: 1,
            guid: `fixture-${name.toLowerCase().replaceAll(" ", "-")}`,
            timestamp: "2026-07-18T20:30:00Z",
          },
        ]
      : [],
    satisfied,
  };
}

const QUALIFIED_PROOF: SpeedrunProof[] = [
  proof("Lucifron", "Bosses", true),
  proof("Sulfuron Harbinger", "Bosses", true),
  proof("Basalthar", "Bosses", true),
  proof("Magmadar", "Bosses", true),
  proof("Golemagg the Incinerator", "Bosses", true),
  proof("Smoldaris", "Bosses", true),
  proof("Garr", "Bosses", true),
  proof("Majordomo Executus", "Bosses", true),
  proof("Sorcerer-Thane Thaurissan", "Bosses", true),
  proof("Shazzrah", "Bosses", true),
  proof("Ragnaros", "Bosses", true),
  proof("Baron Geddon", "Bosses", true),
  proof("Incindis", "Bosses", true),
  proof("Firesworn", "Trash", true, 8),
];

export const QUALIFIED_FIXTURE_SPEEDRUN: SpeedrunResult = {
  qualified: true,
  start_time: "2026-07-18T20:00:00Z",
  completion_time: "2026-07-18T22:23:44Z",
  duration_ms: FIXTURE_DURATION_MS,
  proof: QUALIFIED_PROOF,
  version_status: {
    parser_version: "v0.0.424",
    min_parser_version: "v0.0.420",
    parser_qualified: true,
    addon_version: "0.25",
    min_addon_version: "0.25",
    addon_qualified: true,
  },
  data_source: {
    has_server_side: false,
    has_addon_version: true,
    eligible: true,
  },
  dps_rankings: {
    has_rankings: true,
  },
  level_range: {
    requirement: { min_level: 60, max_level: 60 },
    satisfied: true,
    violators: [],
  },
  encounter_kill_times: [
    { encounter_name: "Lucifron", duration_ms: 73_000 },
    { encounter_name: "Magmadar", duration_ms: 98_000 },
  ],
};

export const BLOCKED_FIXTURE_SPEEDRUN: SpeedrunResult = {
  ...QUALIFIED_FIXTURE_SPEEDRUN,
  qualified: false,
  completion_time: "2026-07-18T20:39:07Z",
  duration_ms: 2_347_000,
  proof: [
    proof("Lucifron", "Bosses", true),
    proof("Magmadar", "Bosses", true),
    proof("Gehennas", "Bosses", true),
    proof("Garr", "Bosses", true),
    proof("Baron Geddon", "Bosses", true),
    proof("Shazzrah", "Bosses", false),
    proof("Flamewaker Protectors", "Trash", true, 4),
    proof("Core Hounds", "Trash", false, 5),
  ],
  version_status: {
    ...QUALIFIED_FIXTURE_SPEEDRUN.version_status!,
    addon_version: "0.24",
    addon_qualified: false,
  },
  level_range: {
    requirement: { min_level: 60, max_level: 60 },
    satisfied: false,
    violators: [
      {
        player_guid: GUID.fromString("0x0000000000000001"),
        player_name: "Rook",
        level: 59,
      },
    ],
  },
};

/** Default example variant: a run that qualifies and displays its ranked time. */
export const FIXTURE_SPEEDRUN = QUALIFIED_FIXTURE_SPEEDRUN;

export function getFixtureInstance(): Instance {
  return {
    id: "leaderboard-example-instance",
    name: "Molten Core Example",
    startTime: "2026-07-18T20:00:00Z",
    encounters: [],
    players: {},
    units: {},
    capabilities: [],
  } as unknown as Instance;
}

export function getFixturePanelContext(): PanelContext {
  const entitySelection: EntitySelection = {
    enemyIds: new Set(),
    playerIds: new Set(),
  };

  return {
    instance: getFixtureInstance(),
    selectedPhaseIds: [],
    selectedEncounterIds: [],
    entitySelection,
  };
}

export function getFixtureRenderProps(): PanelRenderProps<LeaderboardPanelResult> {
  return {
    result: {},
    totalEvents: 0,
    processingTimeMs: 0,
    durationMs: FIXTURE_DURATION_MS,
    perSecond: false,
    checkboxChecked: false,
    loading: false,
    processing: false,
    error: null,
    context: getFixturePanelContext(),
  };
}
