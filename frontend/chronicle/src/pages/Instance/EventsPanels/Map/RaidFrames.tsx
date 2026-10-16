import type { MapRaidFrame } from "./useMapScene";

const POWER_COLORS: Record<string, string> = {
  mana: "#3b82f6",
  rage: "#ef4444",
  energy: "#eab308",
  focus: "#f97316",
  runicpower: "#22d3ee",
};

function percent(current: number, max: number): number {
  return max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;
}

function RaidFrame({ frame }: { frame: MapRaidFrame }) {
  const { health, power } = frame;
  const healthPct = health && !frame.dead ? percent(health.current, health.max) : 0;
  const absorbPct = health && !frame.dead ? percent(health.absorb, health.max) : 0;
  const title = [
    frame.name,
    frame.dead ? "dead" : health ? `${health.current.toLocaleString()} / ${health.max.toLocaleString()} health` : null,
    power ? `${power.current.toLocaleString()} / ${power.max.toLocaleString()} ${power.type}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <div title={title} className={`pointer-events-auto flex w-20 flex-col overflow-hidden rounded-sm border border-black/80 bg-black/80 ${frame.dead ? "opacity-60" : ""}`}>
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
  );
}

/** WoW-style raid frames, columns of five: each player's health and power at the replay cursor. */
export function RaidFrames({ frames }: { frames: MapRaidFrame[] }) {
  if (frames.length === 0) return null;
  return (
    <div aria-label="Raid frames" className="pointer-events-none absolute bottom-2 left-2 z-30 grid max-w-[calc(100%-1rem)] grid-flow-col grid-rows-[repeat(5,auto)] gap-0.5 overflow-hidden">
      {frames.map((frame) => <RaidFrame key={frame.guid} frame={frame} />)}
    </div>
  );
}
