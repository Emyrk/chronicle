import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  castEnds,
  castKind,
  CHANNEL_TICK_SLACK_MS,
  DEFAULT_GCD_MS,
  DEFAULT_IDLE_THRESHOLD_MS,
  DPS_SMOOTHING_BINS,
  playerCasts,
  type CastKind,
  type GcdLookup,
} from "../../EventsPanels/RotationTimeline/derive";
import { SLOT_TEXT_COLORS } from "../../EventsPanels/RotationTimeline/format";
import {
  AUTO_FILL,
  COMPACT_GAP_PX,
  GCD_SPACING_MS,
  MAX_ICON,
  MIN_ICON,
} from "../../EventsPanels/RotationTimeline/laneLayout";
import { MAX_STACKED_ICONS } from "../../EventsPanels/RotationTimeline/railClusters";
import {
  AUTO_ATTACK_SPELL_ID,
  DAMAGE_BIN_MS,
  DAMAGE_LINK_WINDOW_MS,
} from "../../EventsPanels/RotationTimeline/rotationTimeline.processor";
import {
  CLUSTER_CAST_MARGIN_MS,
  type CooldownInfo,
  type RotationTimelinePlayer,
} from "../../EventsPanels/RotationTimeline/RotationTimeline";
import { DEFAULT_IGNORED_SPELLS } from "../../EventsPanels/RotationTimeline/useRotationView";
import type { SpellMeta } from "../../EventsPanels/RotationTimeline/useSpellMeta";
import { FULL_UPTIME, NONE_UPTIME } from "./AuraSection";
import { findOverride, SPELL_OVERRIDES, type SpellOverride } from "../../EventsPanels/RotationTimeline/spellOverrides";

export interface CuratedCooldown {
  cooldownMs: number;
  durationMs: number;
  /** Ignored by an admin on /technical/cooldowns. */
  ignored: boolean;
}

interface PlayerTimelineRulesProps {
  players: readonly RotationTimelinePlayer[];
  spellMeta: (spellId: number | null) => SpellMeta;
  gcd: GcdLookup;
  cooldownInfo: (spellId: number) => CooldownInfo | null;
  /** Any curated cooldown entry for the spell, before the lane threshold. */
  curatedCooldown: (spellId: number) => CuratedCooldown | null;
  isIgnored: (spellName: string) => boolean;
  /** Curated cooldowns at least this long are drawn as cooldowns. */
  cooldownMinMs: number;
  /** Spell overrides active for this log's flavor. */
  overrides: readonly SpellOverride[];
  onFlipBack: () => void;
}

interface SpellRow {
  spellId: number;
  name: string;
  kind: CastKind;
  channel: boolean;
  /** Average observed cast or channel length, ms. */
  observedMs: number;
  uses: number[];
}

const KIND_LABEL: Record<CastKind, string> = { cooldown: "Cooldown", proc: "Proc", gcd: "Cast" };
const KIND_ORDER: Record<CastKind, number> = { cooldown: 0, gcd: 1, proc: 2 };

const ms = (v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`);
/** Spell data uses -1 for auras that last until cancelled. */
const duration = (v: number | undefined) => (v == null || v === 0 ? "—" : v < 0 ? "until cancelled" : ms(v));
/**
 * Pipe-format logs write a SPELL_START a few ms before an instant's SPELL_GO, so
 * only a cast this long counts as having a cast time here.
 */
const MIN_CAST_TIME_MS = 250;

/**
 * The back of the Player Timeline (Shift+click): every spell A and B used and
 * how the timeline treats it, plus the rules and constants behind the view.
 */
export function PlayerTimelineRules({
  players,
  spellMeta,
  gcd,
  cooldownInfo,
  curatedCooldown,
  isIgnored,
  cooldownMinMs,
  overrides,
  onFlipBack,
}: PlayerTimelineRulesProps) {
  const overrideFor = (r: SpellRow) => findOverride(overrides, r.spellId, r.name);
  const rows = useMemo(() => {
    const byId = new Map<number, SpellRow & { observedTotal: number; observedCount: number }>();
    players.forEach((p, slot) => {
      const casts = playerCasts(p.data);
      const ends = castEnds(casts, gcd);
      for (const c of casts) {
        let row = byId.get(c.spellId);
        if (!row) {
          row = {
            spellId: c.spellId,
            name: c.spellName,
            kind: castKind(c, gcd, cooldownInfo),
            channel: false,
            observedMs: 0,
            observedTotal: 0,
            observedCount: 0,
            uses: players.map(() => 0),
          };
          byId.set(c.spellId, row);
        }
        row.uses[slot] += 1;
        row.channel ||= c.channel;
        const length = (ends.get(c) ?? c.startMs) - c.startMs;
        if (length > 0) {
          row.observedTotal += length;
          row.observedCount += 1;
        }
      }
    });
    return Array.from(byId.values())
      .map((r) => ({ ...r, observedMs: r.observedCount ? r.observedTotal / r.observedCount : 0 }))
      .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.uses.reduce((x, y) => x + y) - a.uses.reduce((x, y) => x + y));
  }, [players, gcd, cooldownInfo]);

  const reason = (r: SpellRow): string => {
    const override = overrideFor(r);
    if (override) return `Manual override: ${override.note}`;
    const curated = curatedCooldown(r.spellId);
    const meta = spellMeta(r.spellId).spell;
    if (r.kind === "cooldown") {
      const tint = cooldownInfo(r.spellId)?.durationMs;
      return `Curated cooldown ${ms(curated?.cooldownMs ?? 0)} ≥ ${ms(cooldownMinMs)}${tint ? `; tints ${ms(tint)}` : "; no duration, no tint"}`;
    }
    if (r.kind === "proc") {
      const note = curated ? ` (curated cooldown ${ms(curated.cooldownMs)} < ${ms(cooldownMinMs)})` : "";
      return `Instant with GCD 0, assumed not pressed${note}`;
    }
    if (r.channel) return "Channel: ends at last tick, planned length, or next GCD cast";
    if (r.observedMs >= MIN_CAST_TIME_MS) return "Cast time: bar leads into the icon where it landed";
    if (!meta) return `Instant; no spell data, GCD assumed ${ms(DEFAULT_GCD_MS)}`;
    return "Instant on the GCD";
  };

  return (
    <div className="flex flex-col gap-5 bg-card p-4 text-[12px] text-foreground">
      <div className="flex items-center gap-3">
        <div className="text-[15px] font-semibold">Rules &amp; assumptions</div>
        <span className="text-[11px] text-muted-foreground">How the Player Timeline treats each spell. Shift+click to flip back.</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onFlipBack}
          className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Back to timeline
        </button>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Spells in this encounter</h3>
        <div className="styled-scrollbar overflow-x-auto rounded border border-border">
          <table className="w-full min-w-[900px] text-left text-[11px]">
            <thead className="bg-background text-muted-foreground">
              <tr>
                <Th>Spell</Th>
                <Th>Drawn as</Th>
                <Th>Why</Th>
                <Th right>GCD</Th>
                <Th right>Cast (data)</Th>
                <Th right>Observed</Th>
                <Th right>Curated CD</Th>
                <Th right>Duration</Th>
                <Th>IsAbility</Th>
                {players.map((p, i) => (
                  <Th key={p.guid} right>
                    <span style={{ color: SLOT_TEXT_COLORS[i] }}>{p.name}</span>
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = spellMeta(r.spellId);
                const spell = meta.spell;
                const curated = curatedCooldown(r.spellId);
                const ignored = isIgnored(r.name);
                const overridden = overrideFor(r)?.showAsCooldown != null;
                return (
                  <tr key={r.spellId} className={cn("border-t border-border", ignored && "opacity-50")}>
                    <Td>
                      <span className="flex items-center gap-2">
                        <span
                          className="size-4 shrink-0 rounded-[2px] bg-muted bg-cover bg-center"
                          style={{ backgroundImage: `url(${meta.icon})` }}
                        />
                        <span className="truncate">{r.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">#{r.spellId}</span>
                        {ignored && <span className="text-[10px] text-destructive">ignored</span>}
                      </span>
                    </Td>
                    <Td override={overridden}>{r.channel && r.kind === "gcd" ? "Channel" : KIND_LABEL[r.kind]}</Td>
                    <Td muted override={overridden}>{reason(r)}</Td>
                    <Td right mono>{spell ? ms(gcd(r.spellId)) : `${ms(DEFAULT_GCD_MS)}*`}</Td>
                    <Td right mono>{spell?.casting_time?.Base ? ms(spell.casting_time.Base) : "—"}</Td>
                    <Td right mono>{r.observedMs >= MIN_CAST_TIME_MS ? ms(r.observedMs) : "—"}</Td>
                    <Td right mono>
                      {curated ? `${ms(curated.cooldownMs)}${curated.ignored ? " (admin ignored)" : ""}` : "—"}
                    </Td>
                    <Td right mono override={overridden}>
                      {overridden && cooldownInfo(r.spellId)
                        ? duration(cooldownInfo(r.spellId)?.durationMs)
                        : duration(spell?.duration?.Duration)}
                    </Td>
                    <Td>{spell ? (spell.attributes?.string?.includes("IsAbility") ? "yes" : "no") : "?"}</Td>
                    {r.uses.map((n, i) => (
                      <Td key={i} right mono>
                        {n || "—"}
                      </Td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm border border-yellow-500/40 bg-yellow-500/15" />
            Manual override (spellOverrides.ts)
          </span>
          <span>* No spell data loaded; the default GCD is assumed.</span>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Spell overrides</h3>
        <ul className="flex flex-col gap-1.5 text-muted-foreground">
          {SPELL_OVERRIDES.map((o) => {
            const active = overrides.includes(o);
            return (
              <li key={o.id} className="flex flex-wrap items-baseline gap-2">
                <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", active ? "bg-yellow-500/15 text-yellow-300" : "bg-muted text-muted-foreground")}>
                  {active ? "Active" : "Inactive"}
                </span>
                <span className="text-foreground">{[...(o.names ?? []), ...(o.spellIds ?? []).map((id) => `#${id}`)].join(", ")}</span>
                {o.showAsCooldown && (
                  <span>
                    shown as a cooldown
                    {o.showAsCooldown.durationMs != null ? ` (${ms(o.showAsCooldown.durationMs)})` : " (spell or buff duration)"}
                  </span>
                )}
                {o.color && (
                  <span className="flex items-center gap-1">
                    <span className="size-2.5 rounded-sm" style={{ background: o.color }} />
                    color
                  </span>
                )}
                {o.flavor && <span className="font-mono text-[10px]">flavor: {o.flavor.join(" + ")}</span>}
                <span>· {o.note}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <RuleList title="Casts and lanes">
          <li>
            A cast is a <b>Cooldown</b> when the curated list (/technical/cooldowns) has it with a cooldown of at least{" "}
            {ms(cooldownMinMs)} and an admin has not ignored it. Cooldowns are ringed squares on the rail and tint the lane
            for their duration.
          </li>
          <li>
            A cast is a <b>Proc</b> when it is instant and its spell data has a GCD of 0. Procs are circles on the rail and
            are not counted as actions in the last/next readout.
          </li>
          <li>Everything else is a <b>Cast</b>: an icon in the lane, with a bar for cast time or channel.</li>
          <li>
            GCD per spell comes from spell data (start_recovery_time). Without spell data, {ms(DEFAULT_GCD_MS)} is assumed.
          </li>
          <li>
            A channel ends at its last tick (ticks up to {ms(CHANNEL_TICK_SLACK_MS)} past the planned end count), else its
            planned length, and never after the next GCD or cast-time spell.
          </li>
          <li>
            Idle: a gap of at least {ms(DEFAULT_IDLE_THRESHOLD_MS)} between one cast's slot (cast time or GCD) ending and the
            next cast. Shorter pauses count as busy.
          </li>
          <li>
            Direct damage links to the latest cast of the same spell within {ms(DAMAGE_LINK_WINDOW_MS)}; periodic ticks link to
            the latest cast of that spell.
          </li>
          <li>Auto attacks are damage with spell ID {AUTO_ATTACK_SPELL_ID}; the off hand comes from the hit type.</li>
          <li>
            Rail icons stack (up to {MAX_STACKED_ICONS} shown) only when they would overlap on screen. A stack's tooltip also
            lists casts within {ms(CLUSTER_CAST_MARGIN_MS)} of it.
          </li>
          <li>
            Ignored spells (by name, every rank) are hidden and saved per browser. Defaults: {DEFAULT_IGNORED_SPELLS.join(", ")}.
          </li>
        </RuleList>
        <RuleList title="Chart, auras and defaults">
          <li>
            DPS: damage (pets and weapon procs included) in {ms(DAMAGE_BIN_MS)} bins, as a {DPS_SMOOTHING_BINS}-bin trailing
            average. Damage lead is cumulative A minus B.
          </li>
          <li>
            Auto icon size: {Math.round(AUTO_FILL * 100)}% of a {ms(GCD_SPACING_MS)} GCD's width, {MIN_ICON}–{MAX_ICON}px.
            Under {COMPACT_GAP_PX}px per GCD, casts draw as ticks.
          </li>
          <li>Auras use the shared aura tracker (the same one as Aura Uptime and Unit Auras).</li>
          <li>
            Key auras: the player's own class or Generic spells. Other classes' spells, admin-ignored and unknown spells go
            under Other.
          </li>
          <li>
            Whole fight row: up at least {Math.round(FULL_UPTIME * 100)}% or at most {Math.round(NONE_UPTIME * 100)}% for
            every player.
          </li>
          <li>Debuffs on a target only include ones the player applied (when the log names the caster).</li>
          <li>
            Default players: your highest-damage favorite, then another favorite (same class first); otherwise the top
            damage dealer and the next player of their class.
          </li>
        </RuleList>
      </div>
    </div>
  );
}

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return <th className={cn("whitespace-nowrap px-2 py-1.5 font-medium", right && "text-right")}>{children}</th>;
}

function Td({
  children,
  right,
  mono,
  muted,
  override,
}: {
  children: ReactNode;
  right?: boolean;
  mono?: boolean;
  muted?: boolean;
  /** Value changed by a manual spell override: highlighted yellow. */
  override?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-2 py-1.5 align-middle",
        right && "text-right",
        mono && "font-mono",
        muted && "text-muted-foreground",
        override && "bg-yellow-500/15 text-yellow-200",
      )}
    >
      {children}
    </td>
  );
}

function RuleList({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <ul className="list-disc space-y-1.5 pl-4 text-muted-foreground [&_b]:text-foreground">{children}</ul>
    </section>
  );
}
