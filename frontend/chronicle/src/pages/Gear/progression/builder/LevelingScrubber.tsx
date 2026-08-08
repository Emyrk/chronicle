import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface LevelingScrubberProps {
  level: number;
  minLevel: number;
  maxLevel: number;
  onChange: (level: number) => void;
  /** Levels where the pool unlocks something; drawn as ticks on the rail. */
  upgradeLevels?: readonly number[];
  /** Average item level of the derived set at the current level. */
  averageItemLevel?: number | null;
  /** How many of the 17 non-cosmetic slots the pool fills here. */
  filledSlots?: number;
  totalSlots?: number;
}

/**
 * The leveling axis: a continuous scrubber from level 1 to just below the
 * cap. Ticks mark the levels where the player's pool actually unlocks
 * something, so the empty stretches are visible at a glance.
 */
export function LevelingScrubber({
  level,
  minLevel,
  maxLevel,
  onChange,
  upgradeLevels = [],
  averageItemLevel,
  filledSlots,
  totalSlots,
}: LevelingScrubberProps) {
  const span = Math.max(1, maxLevel - minLevel);
  const percentOf = (l: number) => ((l - minLevel) / span) * 100;

  // The nearest tick in each direction, so the arrows jump between real
  // upgrades instead of crawling one level at a time.
  const prevUpgrade = [...upgradeLevels].reverse().find((l) => l < level);
  const nextUpgrade = upgradeLevels.find((l) => l > level);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-3xs uppercase tracking-[0.2em] text-zinc-500">Level</span>
          <span className="font-wow text-2xl text-amber-100/90 tabular-nums">{level}</span>
        </div>
        <div className="flex-1" />
        <span className="text-xs text-zinc-400">
          avg ilvl{" "}
          <span className="font-mono text-zinc-200">
            {averageItemLevel != null ? averageItemLevel.toFixed(1) : "—"}
          </span>
        </span>
        {filledSlots != null && totalSlots != null && (
          <span className="text-xs text-zinc-400">
            <span className="font-mono text-zinc-200">{filledSlots}</span>
            <span className="text-zinc-500">/{totalSlots} slots</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <ScrubStep
          label="Previous upgrade"
          disabled={level <= minLevel}
          onClick={() => onChange(prevUpgrade ?? Math.max(minLevel, level - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </ScrubStep>

        <div className="relative min-w-24 flex-1">
          {/* Upgrade ticks sit behind the native track. */}
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-3 -translate-y-1/2">
            {upgradeLevels.map((l) => (
              <span
                key={l}
                className={cn(
                  "absolute top-0 h-3 w-px -translate-x-1/2",
                  l <= level ? "bg-blue-400/70" : "bg-zinc-600/70",
                )}
                style={{ left: `${percentOf(l)}%` }}
              />
            ))}
          </div>
          <input
            type="range"
            min={minLevel}
            max={maxLevel}
            step={1}
            value={level}
            onChange={(e) => onChange(Number(e.target.value))}
            className="relative w-full cursor-pointer accent-blue-500"
            aria-label="Character level"
          />
        </div>

        <ScrubStep
          label="Next upgrade"
          disabled={level >= maxLevel}
          onClick={() => onChange(nextUpgrade ?? Math.min(maxLevel, level + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </ScrubStep>

        <input
          type="number"
          min={minLevel}
          max={maxLevel}
          value={level}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) onChange(Math.min(maxLevel, Math.max(minLevel, next)));
          }}
          className="h-8 w-16 rounded border border-zinc-700 bg-zinc-900 px-2 text-sm font-mono text-zinc-200"
          aria-label="Character level (exact)"
        />
      </div>

      <div className="flex justify-between font-mono text-3xs text-zinc-600">
        <button type="button" className="hover:text-zinc-400" onClick={() => onChange(minLevel)}>
          {minLevel}
        </button>
        <button type="button" className="hover:text-zinc-400" onClick={() => onChange(maxLevel)}>
          {maxLevel}
        </button>
      </div>
    </div>
  );
}

function ScrubStep({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded border border-zinc-700 p-1 text-zinc-400 transition-colors hover:text-zinc-100 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
