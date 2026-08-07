import type { WoWParsedInstance } from "@/api/typesGenerated"

export interface AbsoluteTimeRange {
  start: number
  end: number
}

export interface VideoTimelineAnchor {
  videoTimeSeconds: number
  serverTime: string
}

export interface TimelineModel {
  rangeStart: number
  rangeEnd: number
  raid: AbsoluteTimeRange
  video: AbsoluteTimeRange
  overlapMilliseconds: number
  gapMilliseconds: number
  videoPosition: { left: number; width: number }
  raidPosition: { left: number; width: number }
}

export function getRaidBounds(instance?: WoWParsedInstance): AbsoluteTimeRange | null {
  if (!instance) return null

  const starts = instance.encounters
    .map((encounter) => Date.parse(encounter.start_time))
    .filter(Number.isFinite)
  const ends = instance.encounters
    .map((encounter) => Date.parse(encounter.end_time))
    .filter(Number.isFinite)

  const instanceStart = instance.start_time ? Date.parse(instance.start_time) : NaN
  const instanceEnd = instance.end_time ? Date.parse(instance.end_time) : NaN
  if (Number.isFinite(instanceStart)) starts.push(instanceStart)
  if (Number.isFinite(instanceEnd)) ends.push(instanceEnd)
  if (starts.length === 0 || ends.length === 0) return null

  return { start: Math.min(...starts), end: Math.max(...ends) }
}

function parseServerSeconds(serverTime: string, offsetHours: number): number | null {
  const match = serverTime.match(/^(\d{1,2}):(\d{2}):(\d{2})$/)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  if (hours > 23 || minutes > 59 || seconds > 59) return null

  const utcSeconds = hours * 3600 + minutes * 60 + seconds - offsetHours * 3600
  return ((utcSeconds % 86400) + 86400) % 86400
}

function intervalGap(a: AbsoluteTimeRange, b: AbsoluteTimeRange): number {
  if (a.end < b.start) return b.start - a.end
  if (b.end < a.start) return a.start - b.end
  return 0
}

export function inferVideoRange(
  raid: AbsoluteTimeRange,
  durationSeconds: number,
  anchor: VideoTimelineAnchor,
  offsetHours: number
): AbsoluteTimeRange | null {
  const utcSeconds = parseServerSeconds(anchor.serverTime, offsetHours)
  if (utcSeconds === null || durationSeconds <= 0) return null

  const raidStart = new Date(raid.start)
  const raidDay = Date.UTC(
    raidStart.getUTCFullYear(),
    raidStart.getUTCMonth(),
    raidStart.getUTCDate()
  )

  const candidates = [-2, -1, 0, 1, 2].map((dayOffset) => {
    const anchorTime = raidDay + dayOffset * 86_400_000 + utcSeconds * 1000
    const start = anchorTime - anchor.videoTimeSeconds * 1000
    return { start, end: start + durationSeconds * 1000 }
  })

  return candidates.sort((left, right) => {
    const gapDifference = intervalGap(left, raid) - intervalGap(right, raid)
    if (gapDifference !== 0) return gapDifference
    const raidCenter = (raid.start + raid.end) / 2
    const leftCenter = (left.start + left.end) / 2
    const rightCenter = (right.start + right.end) / 2
    return Math.abs(leftCenter - raidCenter) - Math.abs(rightCenter - raidCenter)
  })[0]
}

export function buildTimelineModel(
  raid: AbsoluteTimeRange,
  video: AbsoluteTimeRange
): TimelineModel {
  const rangeStart = Math.min(raid.start, video.start)
  const rangeEnd = Math.max(raid.end, video.end)
  const span = Math.max(1, rangeEnd - rangeStart)
  const position = (range: AbsoluteTimeRange) => ({
    left: ((range.start - rangeStart) / span) * 100,
    width: Math.max(0.8, ((range.end - range.start) / span) * 100),
  })
  const overlapMilliseconds = Math.max(
    0,
    Math.min(raid.end, video.end) - Math.max(raid.start, video.start)
  )

  return {
    rangeStart,
    rangeEnd,
    raid,
    video,
    overlapMilliseconds,
    gapMilliseconds: intervalGap(raid, video),
    videoPosition: position(video),
    raidPosition: position(raid),
  }
}
