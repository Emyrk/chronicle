/** The run's length as a clock: 28:42, or 1:02:03 past the hour; null without encounters. */
export function formatRunDuration(ms: number | null | undefined): string | null {
  if (!ms || ms <= 0) return null;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
