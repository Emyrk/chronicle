import type { KillTimeLeaderboardEntry, RankingsEntry, SpeedrunLeaderboardEntry } from "@/api/typesGenerated";
import { entityAttributes } from "./entity";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

/** Alt+click attributes for a guild name; empty when the row has no known guild. */
export function guildAttributes(id: string | undefined, name: string): Partial<ReturnType<typeof entityAttributes>> {
  return id && id !== NIL_UUID && name ? entityAttributes({ kind: "guild", id, name }) : {};
}

/** Alt+click attributes for the player on a DPS/HPS rankings row. */
export function rankingPlayerAttributes(entry: RankingsEntry): ReturnType<typeof entityAttributes> {
  return entityAttributes({
    kind: "character",
    realm: entry.realm_name,
    guid: entry.player_guid,
    name: entry.player_name,
    className: entry.player_class,
  });
}

/**
 * Alt+click attributes for one kill on the kill time leaderboard, as an encounter to compare.
 * Empty when the server predates encounter and instance ids on these rows.
 */
export function killAttributes(entry: KillTimeLeaderboardEntry): Partial<ReturnType<typeof entityAttributes>> {
  if (!entry.encounter_id || !entry.instance_id) return {};
  const durationMs = Math.round(entry.duration_secs * 1000);
  return entityAttributes({
    kind: "encounter",
    id: entry.encounter_id,
    name: entry.encounter_name,
    logId: entry.instance_id,
    instanceName: entry.instance_name,
    killType: "clean",
    durationMs,
    startTime: new Date(Date.parse(entry.killed_at) - durationMs).toISOString(),
  });
}

/** Alt+click attributes for one clear on the speedrun board, as a raid to compare. */
export function speedrunClearAttributes(entry: SpeedrunLeaderboardEntry, instanceName: string): ReturnType<typeof entityAttributes> {
  return entityAttributes({
    kind: "raid",
    id: entry.instance_id,
    name: instanceName,
    difficultyName: entry.difficulty_name,
    logId: entry.instance_id,
    clearMs: entry.duration_ms,
    startTime: entry.start_time,
    guildName: entry.guild_name || undefined,
  });
}
