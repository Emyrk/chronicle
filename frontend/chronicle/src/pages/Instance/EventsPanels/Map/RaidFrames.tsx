import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import type { MapRaidFrame } from "./useMapScene";

const POWER_COLORS: Record<string, string> = {
  mana: "#3b82f6",
  rage: "#ef4444",
  energy: "#eab308",
  focus: "#f97316",
  runicpower: "#22d3ee",
};

const POWER_LABELS: Record<string, string> = {
  runicpower: "Runic Power",
};

function percent(current: number, max: number): number {
  return max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function StatRow({ label, color, current, max }: { label: string; color: string; current: number; max: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: color }} />
      <span className="w-16 text-zinc-400">{label}</span>
      <span className="ml-auto font-mono tabular-nums">{current.toLocaleString()} / {max.toLocaleString()}</span>
      <span className="w-10 text-right font-mono tabular-nums text-zinc-400">{percent(current, max).toFixed(0)}%</span>
    </div>
  );
}

function RaidFrameTooltip({ frame }: { frame: MapRaidFrame }) {
  const { health, power } = frame;
  return (
    <div className="flex min-w-52 flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold" style={{ color: frame.color }}>{frame.name}</span>
        <span className="text-zinc-400">{capitalize(frame.class)}</span>
        {frame.tank && <span className="rounded bg-white/10 px-1 text-[10px] uppercase tracking-wide text-zinc-300">Tank</span>}
        {frame.dead && <span className="ml-auto rounded bg-red-500/20 px-1 text-[10px] uppercase tracking-wide text-red-300">Dead</span>}
      </div>
      {health ? (
        <StatRow label="Health" color={frame.color} current={health.current} max={health.max} />
      ) : (
        <div className="text-zinc-500">No health data yet</div>
      )}
      {health && health.absorb > 0 && (
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-sm bg-white/60" />
          <span className="w-16 text-zinc-400">Absorb</span>
          <span className="ml-auto font-mono tabular-nums">{health.absorb.toLocaleString()}</span>
          <span className="w-10" />
        </div>
      )}
      {power && (
        <StatRow
          label={POWER_LABELS[power.type] ?? capitalize(power.type)}
          color={POWER_COLORS[power.type] ?? "#a1a1aa"}
          current={power.current}
          max={power.max}
        />
      )}
    </div>
  );
}

function RaidFrame({ frame }: { frame: MapRaidFrame }) {
  const { health, power } = frame;
  const healthPct = health && !frame.dead ? percent(health.current, health.max) : 0;
  const absorbPct = health && !frame.dead ? percent(health.absorb, health.max) : 0;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`pointer-events-auto flex w-20 flex-col overflow-hidden rounded-sm border border-black/80 bg-black/80 ${frame.dead ? "opacity-60" : ""}`}>
          <div className="relative h-4">
            <div className="absolute inset-y-0 left-0" style={{ width: `${healthPct}%`, background: frame.color }} />
            {absorbPct > 0 && (
              <div className="absolute inset-y-0 bg-white/50" style={{ left: `${healthPct}%`, width: `${Math.min(absorbPct, 100 - healthPct)}%` }} />
            )}
            <span className="absolute inset-0 truncate px-1 text-[9px] font-semibold leading-4 text-white [text-shadow:0_0_2px_#000,0_0_2px_#000]">
              {frame.dead ? `☠ ${frame.name}` : frame.name}
            </span>
          </div>
          <div className="h-1 bg-black/60">
            {power && !frame.dead && (
              <div className="h-full" style={{ width: `${percent(power.current, power.max)}%`, background: POWER_COLORS[power.type] ?? "#a1a1aa" }} />
            )}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" align="start" sideOffset={6}>
        <RaidFrameTooltip frame={frame} />
      </TooltipContent>
    </Tooltip>
  );
}

/** WoW-style raid frames, columns of five: each player's health and power at the replay cursor. */
export function RaidFrames({ frames }: { frames: MapRaidFrame[] }) {
  if (frames.length === 0) return null;
  return (
    <TooltipProvider>
      <div aria-label="Raid frames" className="pointer-events-none absolute left-2 top-2 z-30 grid max-w-[calc(100%-1rem)] grid-flow-col grid-rows-[repeat(5,auto)] gap-0.5 overflow-hidden">
        {frames.map((frame) => <RaidFrame key={frame.guid} frame={frame} />)}
      </div>
    </TooltipProvider>
  );
}
