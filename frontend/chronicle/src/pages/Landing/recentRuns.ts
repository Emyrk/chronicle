import type { RecentInstance } from "@/api/typesGenerated";
import type { DungeonShelfKind } from "./dungeonShelf";

export type RunBadge = "3d" | "2d";

/** 3D when the run's map has a published mesh, 2D otherwise, none when the log has no positions. */
export function runBadge(run: Pick<RecentInstance, "has_positions">, mapKind: DungeonShelfKind): RunBadge | null {
  if (!run.has_positions) return null;
  return mapKind === "3d" ? "3d" : "2d";
}

/** The run's replay still (640x360 JPG), rendered by the server after the upload. */
export function runStillUrl(instanceId: string): string {
  return `/api/v1/raidlogs/instances/${encodeURIComponent(instanceId)}/still.jpg`;
}

/** The run's length as a clock: 28:42, or 1:02:03 past the hour; null without encounters. */
export function formatRunDuration(ms: number | null | undefined): string | null {
  if (!ms || ms <= 0) return null;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
