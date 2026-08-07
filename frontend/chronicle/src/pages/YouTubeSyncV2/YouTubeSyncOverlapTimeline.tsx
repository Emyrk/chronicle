import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card/Card"
import type { AbsoluteTimeRange } from "./timeline"
import { buildTimelineModel } from "./timeline"

function formatUtc(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(timestamp)
}

function formatLocal(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(timestamp)
}

function formatDistance(milliseconds: number): string {
  const totalMinutes = Math.round(milliseconds / 60_000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  return [days ? `${days}d` : "", hours ? `${hours}h` : "", `${minutes}m`]
    .filter(Boolean)
    .join(" ")
}

export function YouTubeSyncOverlapTimeline({
  raid,
  video,
  instanceName,
}: {
  raid: AbsoluteTimeRange
  video: AbsoluteTimeRange | null
  instanceName?: string
}) {
  const model = video ? buildTimelineModel(raid, video) : null
  const diagnostic = model
    ? model.overlapMilliseconds > 0
      ? `The video overlaps ${formatDistance(model.overlapMilliseconds)} of the raid log.`
      : model.video.end <= model.raid.start
        ? `The video ends ${formatDistance(model.gapMilliseconds)} before the raid log starts.`
        : `The video starts ${formatDistance(model.gapMilliseconds)} after the raid log ends.`
    : "Run or import one successful timestamp to place the video on the raid timeline."

  return (
    <Card className="overflow-hidden border-cyan-500/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock3 className="size-4 text-cyan-400" />
          Video and raid overlap
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <span>Raid: {instanceName || "Loaded instance"}</span>
          <span className="sm:text-right">{formatUtc(raid.start)} to {formatUtc(raid.end)}</span>
        </div>

        <div className="relative rounded-lg border border-border bg-black/25 px-3 py-5">
          <div className="absolute left-3 right-3 top-1/2 h-px bg-border" />
          {model ? (
            <>
              <TimelineBar
                label="Video"
                className="top-3 bg-cyan-400 text-cyan-950"
                left={model.videoPosition.left}
                width={model.videoPosition.width}
              />
              <TimelineBar
                label="Raid log"
                className="bottom-3 bg-amber-400 text-amber-950"
                left={model.raidPosition.left}
                width={model.raidPosition.width}
              />
            </>
          ) : (
            <TimelineBar label="Raid log" className="bottom-3 bg-amber-400 text-amber-950" left={0} width={100} />
          )}
        </div>

        {model && (
          <div className="flex justify-between gap-3 font-mono text-[11px] text-muted-foreground">
            <div className="text-left">
              <div>{formatUtc(model.rangeStart)}</div>
              <div className="mt-0.5 text-[10px] text-foreground/70">
                {formatLocal(model.rangeStart)} local
              </div>
            </div>
            <div className="text-right">
              <div>{formatUtc(model.rangeEnd)}</div>
              <div className="mt-0.5 text-[10px] text-foreground/70">
                {formatLocal(model.rangeEnd)} local
              </div>
            </div>
          </div>
        )}

        <div className={model?.overlapMilliseconds
          ? "flex gap-2 rounded-md bg-green-500/10 p-3 text-sm text-green-300"
          : model
            ? "flex gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-200"
            : "flex gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground"}
        >
          {model?.overlapMilliseconds
            ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
          <div>
            <p>{diagnostic}</p>
            {model && model.overlapMilliseconds === 0 && (
              <p className="mt-1 text-xs opacity-80">Check the video time offset or confirm that this is the correct instance.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function TimelineBar({
  label,
  left,
  width,
  className,
}: {
  label: string
  left: number
  width: number
  className: string
}) {
  return (
    <div
      className={`absolute h-5 min-w-8 overflow-hidden rounded-sm px-2 text-center text-[10px] font-bold leading-5 shadow ${className}`}
      style={{ left: `${left}%`, width: `${width}%` }}
      title={label}
    >
      {label}
    </div>
  )
}
