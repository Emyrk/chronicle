import { Clock } from "lucide-react";

function formatDurationMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}hr ${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function TimingRow({
  label,
  durationMs,
  description,
}: {
  label: string;
  durationMs: number;
  description: string;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-2">
      <Clock className="mt-0.5 h-3.5 w-3.5 opacity-60" />
      <div>
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-medium">{label}</span>
          <span className="font-mono tabular-nums">{formatDurationMs(durationMs)}</span>
        </div>
        <p className="mt-0.5 leading-snug opacity-65">{description}</p>
      </div>
    </div>
  );
}

export function InstanceTimingTooltip({
  elapsedDurationMs,
  rankedDurationMs,
  combatDurationMs,
}: {
  elapsedDurationMs: number;
  rankedDurationMs?: number;
  combatDurationMs: number;
}) {
  return (
    <div className="w-80 space-y-3 py-1 text-left">
      <TimingRow
        label="Elapsed time"
        durationMs={elapsedDurationMs}
        description="From the first encounter start to the last encounter end, including downtime."
      />
      {rankedDurationMs !== undefined && (
        <TimingRow
          label="Ranked time"
          durationMs={rankedDurationMs}
          description="Leaderboard time from the first required boss pull to the final required boss encounter end."
        />
      )}
      <TimingRow
        label="Combat time"
        durationMs={combatDurationMs}
        description="Sum of all encounter durations, excluding downtime between encounters."
      />
    </div>
  );
}
