export type EventTimelinePreviewKind = "damage" | "healing" | "prevented" | "other";

export interface EventTimelinePreviewEvent {
  id: string;
  relativeMilli: number;
  kind: EventTimelinePreviewKind;
}

export function timelinePreviewPercent(relativeMilli: number, windowMilli: number): number {
  if (windowMilli <= 0) return 0;
  return Math.max(0, Math.min(100, (-relativeMilli / windowMilli) * 100));
}

export function timelinePreviewTimeAtY(y: number, height: number, windowMilli: number): number {
  if (height <= 0 || windowMilli <= 0) return 0;
  const percent = Math.max(0, Math.min(1, y / height));
  return percent === 0 ? 0 : -percent * windowMilli;
}
