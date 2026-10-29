import { Flame, Users } from "lucide-react";
import type { Instance } from "@/pages/Instance/InstancePage";
import { latestResourceAt } from "@/pages/Instance/EventsPanels/RaidFrames/raidFrames.processor";
import { POWER_COLORS, percent } from "@/pages/Instance/EventsPanels/RaidFrames/raidFrameShared";
import { ThreatEstimatedLabel, ThreatMeter } from "@/pages/Instance/EventsPanels/Threat/ThreatMeter";
import type { HeroStats } from "./useHeroStats";

function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The Raid Frames panel's overlay look at the cursor, from its processor: each player's health on a class-coloured
 * bar with a thin power line, in columns of five, sorted by class then name as the panel does without group data.
 */
function HeroRaidFrames({ instance, stats }: { instance: Instance; stats: HeroStats }) {
  const encounter = stats.frames?.encounters.get(stats.encounterId);
  if (!encounter) return null;
  const players = Object.entries(instance.players ?? {})
    .sort(([, left], [, right]) => left.class.localeCompare(right.class) || left.name.localeCompare(right.name));
  return (
    <div className="styled-scrollbar overflow-x-auto">
      <ul aria-label="Raid frames" className="grid w-max grid-flow-col grid-rows-[repeat(5,auto)] gap-0.5">
        {players.map(([guid, player]) => {
          const sample = latestResourceAt(encounter.resourcesByUnit.get(guid) ?? [], stats.cursorMs);
          const dead = sample?.currentHealth === 0 && sample.maximumHealth > 0;
          const health = sample && !dead ? percent(sample.currentHealth, sample.maximumHealth) : 0;
          return (
            <li
              key={guid}
              title={sample && sample.maximumHealth > 0 ? `${player.name}: ${Math.round(percent(sample.currentHealth, sample.maximumHealth))}%` : player.name}
              className={`flex w-20 flex-col overflow-hidden rounded-sm border border-black/80 bg-black/80 ${dead ? "opacity-60" : ""}`}
            >
              <div className="relative h-4">
                <div className="absolute inset-y-0 left-0" style={{ width: `${health}%`, background: `var(--color-class-${player.class.toLowerCase()})` }} />
                <span className="absolute inset-0 truncate px-1 text-[9px] font-semibold leading-4 text-white [text-shadow:0_0_2px_#000,0_0_2px_#000]">
                  {dead ? `☠ ${player.name}` : player.name}
                </span>
              </div>
              <div className="h-1 bg-black/60">
                {sample && sample.maximumPower > 0 && !dead && (
                  <div className="h-full" style={{ width: `${percent(sample.currentPower, sample.maximumPower)}%`, background: POWER_COLORS[sample.powerType] ?? "#767676" }} />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The stats column's Raid Frames card, in the glass meter's chrome, timed from the pull's start. */
export function HeroRaidFramesCard({ instance, stats }: { instance: Instance; stats: HeroStats }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-card/60 p-3 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Users className="h-4 w-4" aria-hidden />
          Raid Frames
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">{formatClock(stats.elapsedMs)}</span>
      </div>
      <HeroRaidFrames instance={instance} stats={stats} />
    </div>
  );
}

/** The stats column's Threat (estimated) card: the run page's threat table on the pull's main enemy at the cursor. */
export function HeroThreatCard({ stats }: { stats: HeroStats }) {
  const view = stats.threat;
  if (!view || view.rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-card/60 p-3 shadow-lg backdrop-blur-md" data-hero-threat>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
          <Flame className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">Threat on {view.enemyName}</span>
        </span>
        <ThreatEstimatedLabel />
      </div>
      <ThreatMeter view={view} openLabel={`Threat on ${view.enemyName}`} />
    </div>
  );
}
