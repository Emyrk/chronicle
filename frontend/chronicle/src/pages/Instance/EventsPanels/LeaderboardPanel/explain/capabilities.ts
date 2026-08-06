import type { SpeedrunResult } from "@/api/typesGenerated";
import type { Instance } from "../../../InstancePage";
import type { LeaderboardPanelResult } from "../leaderboard.processor";

export interface LeaderboardCapabilities {
  hasSpeedrun: boolean;
  hasProof: boolean;
  hasEligibilityChecks: boolean;
  hasBlockers: boolean;
}

export const EMPTY_LEADERBOARD_CAPABILITIES: LeaderboardCapabilities = {
  hasSpeedrun: false,
  hasProof: false,
  hasEligibilityChecks: false,
  hasBlockers: false,
};

export function capabilitiesFromSpeedrun(
  speedrun: SpeedrunResult | null | undefined,
): LeaderboardCapabilities {
  if (!speedrun) return EMPTY_LEADERBOARD_CAPABILITIES;

  return {
    hasSpeedrun: true,
    hasProof: speedrun.proof.length > 0,
    hasEligibilityChecks: !!(
      speedrun.version_status ||
      speedrun.data_source ||
      speedrun.dps_rankings
    ),
    hasBlockers:
      !speedrun.qualified ||
      speedrun.proof.some((item) => !item.satisfied) ||
      speedrun.version_status?.parser_qualified === false ||
      speedrun.version_status?.addon_qualified === false ||
      speedrun.data_source?.eligible === false ||
      speedrun.level_range?.satisfied === false,
  };
}

export function deriveCapabilities(
  result: LeaderboardPanelResult | null,
  durationMs: number,
  instance: Instance | null,
): LeaderboardCapabilities {
  void result;
  void durationMs;
  void instance;
  return EMPTY_LEADERBOARD_CAPABILITIES;
}
