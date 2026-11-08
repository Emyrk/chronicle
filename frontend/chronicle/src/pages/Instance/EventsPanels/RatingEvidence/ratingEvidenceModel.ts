import type {
  InstanceRatingEvidenceResponse,
  InstanceRatingPlayerObservation,
} from "@/api/typesGenerated";

export interface RatingEvidenceCounts {
  player: number;
  playerObservations: number;
  playerRenown: number;
  guild: number;
  guildBossTimes: number;
  guildClearTimes: number;
  guildRenown: number;
}

export function countRatingEvidence(response: InstanceRatingEvidenceResponse): RatingEvidenceCounts {
  const playerObservations = response.player.observations.length;
  const playerRenown = response.player.renown.length;
  const guildBossTimes = response.guild.boss_times.length;
  const guildClearTimes = response.guild.clear_times.length;
  const guildRenown = response.guild.renown.length;

  return {
    player: playerObservations + playerRenown,
    playerObservations,
    playerRenown,
    guild: guildBossTimes + guildClearTimes + guildRenown,
    guildBossTimes,
    guildClearTimes,
    guildRenown,
  };
}

export function formatPlayerCohort(
  observation: Pick<InstanceRatingPlayerObservation, "player_class" | "player_spec" | "player_sub_spec">,
): string {
  return [observation.player_class, observation.player_spec, observation.player_sub_spec]
    .filter(Boolean)
    .join(" · ");
}

export function formatMetricName(metric: string): string {
  const normalized = metric.trim().toLowerCase();
  if (normalized === "dps" || normalized === "hps") {
    return normalized.toUpperCase();
  }
  return metric || "Metric";
}

export function formatMetricValue(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function formatDurationMs(durationMs: number): string {
  const safeDurationMs = Math.max(0, Math.round(durationMs));
  const hours = Math.floor(safeDurationMs / 3_600_000);
  const minutes = Math.floor((safeDurationMs % 3_600_000) / 60_000);
  const seconds = Math.floor((safeDurationMs % 60_000) / 1_000);
  const milliseconds = safeDurationMs % 1_000;
  const secondsLabel = milliseconds === 0
    ? seconds.toString()
    : `${seconds}.${milliseconds.toString().padStart(3, "0")}`;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m ${secondsLabel.padStart(milliseconds === 0 ? 2 : 6, "0")}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secondsLabel.padStart(milliseconds === 0 ? 2 : 6, "0")}s`;
  }
  return `${secondsLabel}s`;
}
