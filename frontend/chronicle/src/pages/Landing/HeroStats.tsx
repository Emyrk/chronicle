import { useMemo, type ReactNode } from "react";
import { Swords, Users } from "lucide-react";
import { formatNumber } from "@/lib/format";
import type { Instance } from "@/pages/Instance/InstancePage";
import { aggregateForEncounters } from "@/pages/Instance/EventsPanels/DamageDone/aggregateDamageDone";
import type { DamageDoneResult } from "@/pages/Instance/EventsPanels/DamageDone/damageDone.processor";
import { MeterBars } from "@/pages/Instance/EventsPanels/MeterBars";
import { latestResourceAt } from "@/pages/Instance/EventsPanels/RaidFrames/raidFrames.processor";
import { POWER_COLORS, percent } from "@/pages/Instance/EventsPanels/RaidFrames/raidFrameShared";
import type { HeroStatsLayout } from "./heroReplay";
import type { HeroStats } from "./useHeroStats";

const NO_SELECTION = { enemyIds: new Set<string>(), playerIds: new Set<string>() };

function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function PanelHeader({ icon, title, clockMs }: { icon: ReactNode; title: string; clockMs: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
        {icon}
        {title}
      </span>
      <span className="font-mono text-[10px] text-muted-foreground">{formatClock(clockMs)}</span>
    </div>
  );
}

/**
 * The landing's Damage Done meter (MeterBars in values mode): total, DPS and share per player for the
 * pull so far. Shared by the stats column, the phone strip and the hero's glass meter.
 */
export function HeroDamageMeter({ result, encounterId, elapsedMs, limit }: {
  result: DamageDoneResult | null;
  encounterId: string;
  elapsedMs: number;
  limit?: number;
}) {
  const data = useMemo(
    () => result ? aggregateForEncounters("players", result, [encounterId], NO_SELECTION) : [],
    [encounterId, result],
  );
  const seconds = Math.max(1, elapsedMs) / 1000;
  const total = data.reduce((sum, row) => sum + row.value, 0);
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-muted-foreground">
        Total: <span className="font-mono text-foreground">{formatNumber(total / seconds, 1)}/s</span>
        <span className="ml-2">DPS · share</span>
      </div>
      <MeterBars
        data={data}
        openLabel="Damage Done"
        values={{ formatValue: (value) => formatNumber(value / seconds, 1), limit }}
      />
    </div>
  );
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

const CARD = "flex flex-col gap-2 rounded-md border bg-card/90 px-3.5 py-3 backdrop-blur-sm";

/**
 * The live stats beside the replay, following its cursor: Damage Done on top, Threat (estimated) below it
 * once that panel exists (`threat`), then Raid Frames. The phone strip is the meter's top three only.
 */
export function HeroStatsView({ instance, stats, layout, threat }: {
  instance: Instance;
  stats: HeroStats;
  layout: HeroStatsLayout;
  /** The Threat (estimated) panel's card, when there is one. */
  threat?: ReactNode;
}) {
  const clockMs = Math.max(0, stats.elapsedMs);
  const meter = (
    <HeroDamageMeter result={stats.damage} encounterId={stats.encounterId} elapsedMs={stats.elapsedMs} limit={layout === "strip" ? 3 : undefined} />
  );
  if (layout === "strip") {
    return (
      <section aria-label="Damage Done, live with the replay" className="border-b bg-background px-4 py-3">
        <div className="flex flex-col gap-2">
          <PanelHeader icon={<Swords className="h-3.5 w-3.5" aria-hidden />} title="Damage Done" clockMs={clockMs} />
          {meter}
        </div>
        {threat}
      </section>
    );
  }
  return (
    <div aria-label="Live stats for this pull" className="flex flex-col gap-2">
      <div className={CARD}>
        <PanelHeader icon={<Swords className="h-3.5 w-3.5" aria-hidden />} title="Damage Done" clockMs={clockMs} />
        {meter}
      </div>
      {threat}
      {stats.frames && (
        <div className={CARD}>
          <PanelHeader icon={<Users className="h-3.5 w-3.5" aria-hidden />} title="Raid Frames" clockMs={clockMs} />
          <HeroRaidFrames instance={instance} stats={stats} />
        </div>
      )}
    </div>
  );
}
