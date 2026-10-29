import type { RecentInstance } from "@/api/typesGenerated";
export type RunBadge = "replay";

/** A replay badge when the log recorded unit positions. Every map gets a mesh, so it is always "3D replay". */
export function runBadge(run: Pick<RecentInstance, "has_positions">): RunBadge | null {
  return run.has_positions ? "replay" : null;
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
