import type { ReactNode } from "react";
import {
  AOE_RING_MS,
  BEAM_MS,
  CAST_ICON_MS,
  CAST_RING_MAX_MS,
  COMBAT_TEXT_MS,
  HEAL_COLOR,
  HEAL_CRIT_COLOR,
  HEAL_PULSE_MS,
  HIT_WOBBLE_MS,
  IMPACT_MS,
  INTERRUPTED_ICON_MS,
  INTERRUPT_COLOR,
  INTERRUPT_MS,
  LUNGE_MS,
  MELEE_FLASH_MS,
  OVERHEAL_COLOR,
  RANGED_AUTO_COLOR,
  SLASH_MS,
  STREAK_MS,
  formatHealAmount,
  schoolColor,
} from "@/pages/Instance/EventsPanels/Map/replayEffects";
import { CAST_ARC_OPACITY, CUT_ARC_COLOR, CUT_TICK_COLOR, INTERRUPT_LABEL_COLOR } from "@/pages/Instance/EventsPanels/Map/mapPalette";
import { At, Ground, Token } from "./legendArt";

/**
 * The map legend's combat-effect demos. Timings and colours come from
 * replayEffects (what the 3D map plays); the shapes are drawn with SVG and
 * CSS to read like the map's, which draws them in three.js.
 */

/** Each demo replays once per loop. */
const LOOP_S = 3;
/** The effect starts this far into the loop. */
const START_S = 0.5;
/** The demos play this much slower than the map, so its quick effects can be seen. */
export const DEMO_SLOWDOWN = 3;

// 0 → 1 over `durationMs` (slowed down) after the loop's start, or null outside it.
function phase(seconds: number, durationMs: number, delayS = 0): number | null {
  const t = (seconds % LOOP_S) - START_S - delayS * DEMO_SLOWDOWN;
  const length = (durationMs / 1000) * DEMO_SLOWDOWN;
  return t >= 0 && t <= length ? t / length : null;
}

const SOURCE = { x: 24, y: 62 };
const TARGET = { x: 76, y: 50 };

function Pair({ children, target, source }: { children?: ReactNode; target?: ReactNode; source?: ReactNode }) {
  return (
    <Ground height={130}>
      <At x={SOURCE.x} y={SOURCE.y}>{source ?? <Token ring="var(--color-class-mage)" icon="/c/icons/spec_mage_frost.png" facing={70} />}</At>
      <At x={TARGET.x} y={TARGET.y}>{target ?? <Token kind="hostile" ring="#fb7185" facing={-110} />}</At>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        {children}
      </svg>
    </Ground>
  );
}

// A point `t` of the way from the source to the target, `lift` above the ground.
function along(t: number, lift = 8) {
  return { x: SOURCE.x + (TARGET.x - SOURCE.x) * t, y: SOURCE.y + (TARGET.y - SOURCE.y) * t - lift };
}

/** A spell bolt (or heal bolt) travelling from the caster to the target. */
export function BoltDemo({ seconds, color, crit = false }: { seconds: number; color: string; crit?: boolean }) {
  const p = phase(seconds, BEAM_MS);
  const head = p === null ? 0 : Math.min(1, p * 1.5);
  const tail = Math.max(0, head - 0.4);
  const from = along(tail);
  const to = along(head);
  return (
    <Pair>
      {p !== null && (
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={color} strokeWidth={crit ? 5 : 3} strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={1 - p} />
      )}
    </Pair>
  );
}

/** A ranged auto-attack: a short thin streak. */
export function StreakDemo({ seconds }: { seconds: number }) {
  const p = phase(seconds, STREAK_MS);
  const head = p === null ? 0 : Math.min(1, p * 1.5);
  const from = along(Math.max(0, head - 0.4));
  const to = along(head);
  return (
    <Pair source={<Token ring="var(--color-class-hunter)" icon="/c/icons/spec_hunter_marksmanship.png" facing={70} />}>
      {p !== null && <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={RANGED_AUTO_COLOR} strokeWidth={1.5} vectorEffect="non-scaling-stroke" opacity={1 - p} />}
    </Pair>
  );
}

/** Melee: the attacker lunges in and back, a slash sweeps across the target, and a melee ability bursts under it. */
export function MeleeDemo({ seconds }: { seconds: number }) {
  const lunge = phase(seconds, LUNGE_MS);
  const slash = phase(seconds, SLASH_MS);
  const impact = phase(seconds, IMPACT_MS);
  const step = lunge === null ? 0 : Math.sin(lunge * Math.PI) * 6;
  const color = schoolColor(2);
  const sweep = slash === null ? 0 : (slash - 0.5) * 80;
  return (
    <Ground height={130}>
      <At x={SOURCE.x + step} y={SOURCE.y - step * 0.25}>
        <Token ring="var(--color-class-warrior)" icon="/c/icons/class_warrior.png" facing={70} />
      </At>
      <At x={TARGET.x} y={TARGET.y}>
        <Token kind="hostile" ring="#fb7185" facing={-110} />
      </At>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        {slash !== null && (
          <path
            d={`M ${TARGET.x - 9} ${TARGET.y - 6} Q ${TARGET.x - 2} ${TARGET.y - 16} ${TARGET.x + 7} ${TARGET.y - 8}`}
            transform={`rotate(${sweep} ${TARGET.x} ${TARGET.y - 6})`}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            opacity={1 - slash}
          />
        )}
        {impact !== null && (
          <ellipse cx={TARGET.x} cy={TARGET.y} rx={2 + impact * 7} ry={(2 + impact * 7) * 0.45} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" opacity={1 - impact} />
        )}
      </svg>
    </Ground>
  );
}

/** A hit: the target shakes and flashes in the hit's colour (white for an interrupt). */
export function HitDemo({ seconds, interrupt = false }: { seconds: number; interrupt?: boolean }) {
  const p = phase(seconds, interrupt ? INTERRUPT_MS : HIT_WOBBLE_MS);
  const color = interrupt ? INTERRUPT_COLOR : schoolColor(4);
  const shake = p === null ? 0 : Math.sin(p * Math.PI * 6) * 14 * (1 - p) * (interrupt ? 2 : 1);
  return (
    <Ground height={130}>
      <At x={50} y={55}>
        <div style={{ transform: `rotate(${shake}deg)` }}>
          <Token kind="hostile" ring="#fb7185" facing={0} />
        </div>
        {p !== null && (
          <div className="absolute -left-6 -top-4 h-8 w-12 rounded-full" style={{ background: color, opacity: 0.45 * (1 - p), filter: "blur(6px)" }} />
        )}
      </At>
    </Ground>
  );
}

/** Rings on the ground: an AoE pulse widening from its caster, or a cast closing in on it. */
export function RingDemo({ seconds, cast = false }: { seconds: number; cast?: boolean }) {
  // A two-second cast shown in real time; the AoE ring slowed like the rest.
  const durationMs = cast ? Math.min(2000, CAST_RING_MAX_MS) / DEMO_SLOWDOWN : AOE_RING_MS;
  const p = phase(seconds, durationMs, cast ? -0.3 : 0);
  const color = cast ? schoolColor(6) : schoolColor(4);
  const radius = p === null ? 0 : cast ? 4 - 2.5 * p : 1.5 + 6 * p;
  const brightness = p === null ? 0 : cast ? 0.35 + 0.5 * p : 1 - p;
  return (
    <Ground height={130}>
      <At x={50} y={58}>
        <Token ring={cast ? "var(--color-class-mage)" : "var(--color-class-warlock)"} icon={cast ? "/c/icons/spec_mage_frost.png" : "/c/icons/class_warlock.png"} />
      </At>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        {p !== null && (
          <ellipse cx={50} cy={58} rx={radius * 4.5} ry={radius * 4.5 * 0.45 * 1.6} fill="none" stroke={color} strokeWidth={2.5} vectorEffect="non-scaling-stroke" opacity={brightness} />
        )}
      </svg>
    </Ground>
  );
}

/** A heal: a green bolt to the target and a ring rising up it (gold on crits). */
export function HealDemo({ seconds, crit = false }: { seconds: number; crit?: boolean }) {
  const bolt = phase(seconds, BEAM_MS);
  const pulse = phase(seconds, HEAL_PULSE_MS, BEAM_MS / 1000 * 0.6);
  const head = bolt === null ? 0 : Math.min(1, bolt * 1.5);
  const from = along(Math.max(0, head - 0.4));
  const to = along(head);
  const pulseColor = crit ? HEAL_CRIT_COLOR : HEAL_COLOR;
  return (
    <Pair
      source={<Token ring="var(--color-class-paladin)" icon="/c/icons/spec_paladin_holy.png" facing={70} />}
      target={<Token ring="var(--color-class-warrior)" icon="/c/icons/class_warrior.png" facing={-110} />}
    >
      {bolt !== null && <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={HEAL_COLOR} strokeWidth={crit ? 4.5 : 3} strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={1 - bolt} />}
      {pulse !== null && (
        <ellipse cx={TARGET.x} cy={TARGET.y - pulse * 22} rx={(0.9 + 0.4 * pulse) * (crit ? 6 : 4.5)} ry={(0.9 + 0.4 * pulse) * (crit ? 6 : 4.5) * 0.4} fill="none" stroke={pulseColor} strokeWidth={2.5} vectorEffect="non-scaling-stroke" opacity={1 - pulse} />
      )}
    </Pair>
  );
}

/** Floating combat text: a spell name in its school colour, or a heal amount. */
export function CombatTextDemo({ seconds }: { seconds: number }) {
  const p = phase(seconds, COMBAT_TEXT_MS);
  const rows: { text: string; color: string; crit?: boolean; x: number }[] = [
    { text: "Frostbolt", color: schoolColor(6), x: 22 },
    { text: "Fireball", color: schoolColor(4), crit: true, x: 50 },
    { text: formatHealAmount(1234), color: HEAL_COLOR, x: 78 },
  ];
  return (
    <Ground height={130}>
      {rows.map((row) => (
        <At key={row.text} x={row.x} y={70}>
          <Token kind={row.color === HEAL_COLOR ? "player" : "hostile"} ring={row.color === HEAL_COLOR ? "var(--color-class-warrior)" : "#fb7185"} icon={row.color === HEAL_COLOR ? "/c/icons/class_warrior.png" : null} />
          {p !== null && (
            <span
              className="absolute -translate-x-1/2 whitespace-nowrap font-semibold [text-shadow:0_0_2px_#000,0_0_3px_#000]"
              style={{ left: 0, top: -34 - p * 22, color: row.color, opacity: 1 - p * p, fontSize: row.crit ? 15 : 12 }}
            >
              {row.text}
            </span>
          )}
        </At>
      ))}
    </Ground>
  );
}

/** A cast icon above the caster: casting (outline sweeps), gone off (pop + flash), or interrupted (grey, wiggle, label). */
export function CastIconDemo({ seconds, mode }: { seconds: number; mode: "casting" | "instant" | "interrupted" }) {
  const loop = seconds % LOOP_S;
  const castProgress = Math.min(1, loop / (LOOP_S * 0.8));
  const instant = phase(seconds, CAST_ICON_MS);
  const interrupted = phase(seconds, INTERRUPTED_ICON_MS);
  let scale = 1;
  let opacity = 1;
  let rotate = 0;
  let grey = false;
  if (mode === "casting") scale = loop < 0.15 ? 0.75 + 0.25 * (loop / 0.15) : 1;
  if (mode === "instant") {
    if (instant === null) opacity = 0;
    else {
      scale = instant < 0.2 ? 1 + 0.35 * Math.sin((instant / 0.2) * Math.PI) : 1;
      opacity = instant > 0.65 ? 1 - (instant - 0.65) / 0.35 : 1;
    }
  }
  if (mode === "interrupted") {
    if (interrupted === null) opacity = 0;
    else {
      grey = interrupted > 0.18;
      rotate = interrupted < 0.3 ? Math.sin((interrupted / 0.3) * Math.PI * 3) * 8 : 0;
      opacity = interrupted > 0.62 ? 1 - (interrupted - 0.62) / 0.38 : 1;
      scale = interrupted > 0.62 ? 1 - 0.15 * ((interrupted - 0.62) / 0.38) : 1;
    }
  }
  const sweep = mode === "casting" ? castProgress : mode === "interrupted" ? 0.55 : 1;
  return (
    <Ground height={150}>
      <At x={50} y={78}>
        <Token kind="hostile" ring="#fb7185" />
        <div className="absolute" style={{ left: 0, top: -78, opacity, transform: `translateX(-50%) scale(${scale}) rotate(${rotate}deg)` }}>
          <div
            className="relative h-10 w-10 rounded-sm p-[3px]"
            style={{ background: `conic-gradient(${grey ? CUT_ARC_COLOR : `rgba(255,255,255,${CAST_ARC_OPACITY})`} ${sweep * 100}%, transparent 0)` }}
          >
            {mode === "interrupted" && grey && (
              <div className="absolute h-[6px] w-[2px]" style={{ background: CUT_TICK_COLOR, left: "calc(100% - 2px)", top: "40%" }} />
            )}
            <img src="/c/icons/spell_holy_holybolt.png" alt="" className="h-full w-full rounded-[2px]" style={{ filter: grey ? "grayscale(1) brightness(0.7)" : "none" }} />
            {mode === "instant" && instant !== null && instant < 0.15 && <div className="absolute -inset-2 rounded-md border-2 border-white" style={{ opacity: 1 - instant / 0.15 }} />}
          </div>
          {mode === "interrupted" && grey && (
            <div className="mt-1 whitespace-nowrap text-center text-[10px] font-semibold [text-shadow:0_0_2px_#000]" style={{ color: INTERRUPT_LABEL_COLOR }}>Interrupted</div>
          )}
        </div>
      </At>
    </Ground>
  );
}

/** The demo timings shown under each effect, straight from replayEffects. */
export const EFFECT_TIMINGS = {
  bolt: BEAM_MS,
  streak: STREAK_MS,
  lunge: LUNGE_MS,
  slash: SLASH_MS,
  impact: IMPACT_MS,
  hit: HIT_WOBBLE_MS,
  meleeFlash: MELEE_FLASH_MS,
  aoe: AOE_RING_MS,
  castRing: CAST_RING_MAX_MS,
  heal: HEAL_PULSE_MS,
  interrupt: INTERRUPT_MS,
  combatText: COMBAT_TEXT_MS,
  castIcon: CAST_ICON_MS,
  interruptedIcon: INTERRUPTED_ICON_MS,
} as const;

export { OVERHEAL_COLOR };
