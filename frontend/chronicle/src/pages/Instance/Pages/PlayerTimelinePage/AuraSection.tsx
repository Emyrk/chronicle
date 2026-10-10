import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useFriendlyClassBuffs } from "@/api/classBuffs";
import { SpellIconWithTooltip } from "@/components/ui/SpellIconWithTooltip/SpellIconWithTooltip";
import { cn } from "@/lib/utils";
import { classifyAura, combinePlacements } from "../../EventsPanels/RotationTimeline/auraClassification";
import { alignOffsetMs, playerCasts } from "../../EventsPanels/RotationTimeline/derive";
import { SLOT_COLORS, SLOT_TEXT_COLORS } from "../../EventsPanels/RotationTimeline/format";
import { IndicatorLine } from "../../EventsPanels/RotationTimeline/IndicatorLine";
import type { TimelineAuraSegment } from "../../EventsPanels/RotationTimeline/rotationTimeline.processor";
import type { RotationTimelinePlayer } from "../../EventsPanels/RotationTimeline/RotationTimeline";
import type { RotationView } from "../../EventsPanels/RotationTimeline/useRotationView";
import type { SpellMeta } from "../../EventsPanels/RotationTimeline/useSpellMeta";

interface AuraRow {
  key: string;
  spellId: number | null;
  name: string;
  /** Per slot: segments as [start, end] in that player's raw time. */
  segs: [number, number][][];
  uptime: number[];
}

const LABEL_WIDTH = 220;

interface ClassifiedRows {
  key: AuraRow[];
  other: AuraRow[];
  /** Up the whole fight or not at all for every player; shown densely as icons. */
  flat: AuraRow[];
}

/** Uptime at or above this counts as "the whole fight", at or below NONE as "not at all". */
export const FULL_UPTIME = 0.98;
export const NONE_UPTIME = 0.01;

function isFlat(row: AuraRow): boolean {
  const full = row.uptime.some((u) => u >= FULL_UPTIME);
  return full && row.uptime.every((u) => u >= FULL_UPTIME || u <= NONE_UPTIME);
}

/** Split rows into key / other / flat using each player's class. */
function classifyRows(
  rows: readonly AuraRow[],
  players: readonly RotationTimelinePlayer[],
  spellMeta: (spellId: number | null) => SpellMeta,
  adminIgnored: ReadonlySet<number>,
): ClassifiedRows {
  const out: ClassifiedRows = { key: [], other: [], flat: [] };
  for (const row of rows) {
    const classSet = row.spellId != null ? spellMeta(row.spellId).spell?.spell_class_set?.string : undefined;
    const ignored = row.spellId != null && adminIgnored.has(row.spellId);
    const placement = combinePlacements(
      players.flatMap((p, slot) => (row.segs[slot]?.length ? [classifyAura(classSet, p.className, ignored)] : [])),
    );
    if (isFlat(row)) out.flat.push(row);
    else out[placement].push(row);
  }
  return out;
}

function buildRows(perSlot: readonly (readonly TimelineAuraSegment[])[], durationMs: number): AuraRow[] {
  const rows = new Map<string, AuraRow>();
  perSlot.forEach((segments, slot) => {
    for (const seg of segments) {
      const key = String(seg.spellId ?? seg.spellName);
      let row = rows.get(key);
      if (!row) {
        row = { key, spellId: seg.spellId, name: seg.spellName, segs: perSlot.map(() => []), uptime: perSlot.map(() => 0) };
        rows.set(key, row);
      }
      const end = Math.min(seg.endMs ?? durationMs, durationMs);
      if (end > seg.startMs) row.segs[slot].push([seg.startMs, end]);
    }
  });
  for (const row of rows.values()) {
    row.uptime = row.segs.map((segs) => {
      // Merge overlaps (same aura from different casters) before summing.
      const sorted = segs.slice().sort((a, b) => a[0] - b[0]);
      let total = 0;
      let cur: [number, number] | null = null;
      for (const s of sorted) {
        if (cur && s[0] <= cur[1]) cur[1] = Math.max(cur[1], s[1]);
        else {
          if (cur) total += cur[1] - cur[0];
          cur = [s[0], s[1]];
        }
      }
      if (cur) total += cur[1] - cur[0];
      return durationMs > 0 ? total / durationMs : 0;
    });
  }
  return Array.from(rows.values()).sort((a, b) => {
    const gap = (r: AuraRow) => Math.abs((r.uptime[0] ?? 0) - (r.uptime[1] ?? 0));
    return gap(b) - gap(a) || Math.max(...b.uptime) - Math.max(...a.uptime);
  });
}

interface AuraSectionProps {
  players: readonly RotationTimelinePlayer[];
  view: RotationView;
  spellMeta: (spellId: number | null) => SpellMeta;
  unitName: (guid: string) => string;
  /** Debuff target the user picked, or null for the default (most damaged). */
  pickedTarget: string | null;
  onPickTarget: (guid: string) => void;
}

export function AuraSection({ players, view, spellMeta, unitName, pickedTarget, onPickTarget }: AuraSectionProps) {
  const [open, setOpen] = useState(true);
  const { durationMs } = view;
  const classBuffs = useFriendlyClassBuffs();
  // Only explicit admin ignores; self-targeted spells are ignored by default for
  // raid buff coverage, but self procs are exactly what a rotation needs.
  const adminIgnored = useMemo(() => {
    const ids = new Set<number>();
    for (const spells of Object.values(classBuffs.data ?? {})) {
      for (const spell of spells) if (spell.ignored && !spell.default_ignored) ids.add(spell.id);
    }
    return ids;
  }, [classBuffs.data]);

  const offsets = useMemo(
    () => players.map((p) => alignOffsetMs(playerCasts(p.data), view.align, view.isIgnored)),
    [players, view.align, view.isIgnored],
  );

  const buffs = useMemo(
    () => classifyRows(buildRows(players.map((p) => p.data.aurasOn.filter((a) => a.isBuff)), durationMs), players, spellMeta, adminIgnored),
    [players, durationMs, spellMeta, adminIgnored],
  );

  // Debuff targets: units A or B debuffed, ranked by damage they took from A and B.
  const targets = useMemo(() => {
    const score = new Map<string, number>();
    for (const p of players) {
      for (const seg of p.data.debuffsCast) score.set(seg.target, score.get(seg.target) ?? 0);
      for (const [guid, dmg] of Object.entries(p.data.damageByTarget)) {
        if (score.has(guid)) score.set(guid, (score.get(guid) ?? 0) + dmg);
      }
    }
    return Array.from(score.entries()).sort((a, b) => b[1] - a[1]).map(([guid]) => guid);
  }, [players]);
  const target = pickedTarget && targets.includes(pickedTarget) ? pickedTarget : (targets[0] ?? null);

  const debuffs = useMemo(
    () =>
      classifyRows(
        target ? buildRows(players.map((p) => p.data.debuffsCast.filter((a) => a.target === target)), durationMs) : [],
        players,
        spellMeta,
        adminIgnored,
      ),
    [players, target, durationMs, spellMeta, adminIgnored],
  );

  const P = (ms: number) => ((ms - view.startMs) / Math.max(1, view.endMs - view.startMs)) * 100;

  return (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-9 w-full items-center gap-2 bg-background px-4 text-left font-semibold hover:bg-muted/50"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        Buffs &amp; debuffs
        <span className="font-mono text-[10px] font-normal text-muted-foreground">uptime A·B</span>
      </button>
      {open && (
        <div
          className="relative"
          onPointerMove={(e) => {
            // Rows share the lanes' time axis: label column, then the track.
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left - LABEL_WIDTH;
            const width = rect.width - LABEL_WIDTH;
            view.setCursorMs(x < 0 || width <= 0 ? null : view.startMs + (x / width) * (view.endMs - view.startMs));
          }}
          onPointerLeave={() => view.setCursorMs(null)}
          onClick={(e) => {
            if (e.shiftKey || (e.target as HTMLElement).closest("button, select")) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left - LABEL_WIDTH;
            const width = rect.width - LABEL_WIDTH;
            if (x < 0 || width <= 0) return;
            const span = view.endMs - view.startMs;
            view.pinAt(view.startMs + (x / width) * span, (6 / width) * span);
          }}
        >
          <AuraGroup
            title="Buffs"
            otherLabel="Other buffs"
            rows={buffs}
            players={players}
            offsets={offsets}
            P={P}
            spellMeta={spellMeta}
          />
          <div className="flex h-10 items-center gap-2 border-t border-border px-4 text-[11px] text-muted-foreground">
            <span className="text-[10px] uppercase tracking-wider">Debuffs on</span>
            {targets.length === 0 ? (
              <span>No debuffs attributed to these players</span>
            ) : (
              <select
                value={target ?? ""}
                onChange={(e) => onPickTarget(e.target.value)}
                className="h-7 max-w-64 rounded border border-border bg-background px-2 text-xs text-foreground"
              >
                {targets.map((guid) => (
                  <option key={guid} value={guid}>
                    {unitName(guid)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <AuraGroup
            title={null}
            otherLabel="Other debuffs"
            rows={debuffs}
            players={players}
            offsets={offsets}
            P={P}
            spellMeta={spellMeta}
          />
          {view.indicatorMs != null && (
            <div className="pointer-events-none absolute inset-y-0 right-0 overflow-hidden" style={{ left: LABEL_WIDTH }}>
              <IndicatorLine leftPct={P(view.indicatorMs)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface AuraGroupProps {
  title: string | null;
  otherLabel: string;
  rows: ClassifiedRows;
  players: readonly RotationTimelinePlayer[];
  offsets: number[];
  P: (ms: number) => number;
  spellMeta: (spellId: number | null) => SpellMeta;
}

function AuraGroup({ title, otherLabel, rows, players, offsets, P, spellMeta }: AuraGroupProps) {
  const [otherOpen, setOtherOpen] = useState(false);
  const empty = rows.key.length === 0 && rows.other.length === 0 && rows.flat.length === 0;
  return (
    <div>
      {title && (
        <div className="flex h-5 items-end px-4 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{title}</div>
      )}
      {rows.key.map((row) => (
        <AuraRowView key={row.key} row={row} offsets={offsets} P={P} spellMeta={spellMeta} />
      ))}
      {rows.flat.length > 0 && <WholeFightRow rows={rows.flat} players={players} spellMeta={spellMeta} />}
      {rows.other.length > 0 && (
        <button
          type="button"
          onClick={() => setOtherOpen(!otherOpen)}
          className="flex h-[30px] w-full items-center gap-2 border-t border-border px-4 text-left hover:bg-muted/50"
        >
          <ChevronRight className={cn("size-3 text-muted-foreground transition-transform", otherOpen && "rotate-90")} />
          {otherLabel}
          <span className="font-mono text-[10px] text-muted-foreground">{rows.other.length}</span>
        </button>
      )}
      {otherOpen &&
        rows.other.map((row) => <AuraRowView key={row.key} row={row} offsets={offsets} P={P} spellMeta={spellMeta} compact />)}
      {empty && <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">None</div>}
    </div>
  );
}

interface AuraRowViewProps {
  row: AuraRow;
  offsets: number[];
  P: (ms: number) => number;
  spellMeta: (spellId: number | null) => SpellMeta;
  /** Smaller, indented rows for the "Other" group. */
  compact?: boolean;
}

function AuraRowView({ row, offsets, P, spellMeta, compact }: AuraRowViewProps) {
  const grid = { gridTemplateColumns: `${LABEL_WIDTH}px minmax(0,1fr)` };
  const barH = compact ? 8 : 10;
  const meta = spellMeta(row.spellId);
  return (
    <div className={cn("grid border-t border-border", compact ? "h-6" : "h-[30px]")} style={grid}>
      <div className={cn("flex min-w-0 items-center gap-1.5 pr-3", compact ? "pl-7" : "pl-4")}>
        <AuraIcon meta={meta} name={row.name} size={compact ? 12 : 14} />
        <span className="min-w-0 flex-1 truncate" title={`${row.name}${row.spellId ? ` #${row.spellId}` : ""}`}>
          {row.name}
        </span>
        <span className="flex gap-1.5 font-mono text-[10px]">
          {row.uptime.map((u, slot) => (
            <span key={slot} style={{ color: SLOT_COLORS[slot] }}>
              {Math.round(u * 100)}%
            </span>
          ))}
        </span>
      </div>
      <div className="relative overflow-hidden border-l border-border">
        {row.segs.map((segs, slot) =>
          segs.map(([s, e]) => {
            const left = P(s - offsets[slot]);
            const right = P(e - offsets[slot]);
            if (right < 0 || left > 100) return null;
            return (
              <div
                key={`${slot}-${s}`}
                className="absolute border-l-2"
                style={{
                  top: slot === 0 ? 3 : 4 + barH,
                  height: barH,
                  left: `${left}%`,
                  width: `${Math.max(0.2, right - left)}%`,
                  borderColor: SLOT_COLORS[slot],
                  background: `color-mix(in oklab, ${SLOT_COLORS[slot]} ${compact ? 45 : 55}%, transparent)`,
                }}
              />
            );
          }),
        )}
      </div>
    </div>
  );
}

interface WholeFightRowProps {
  rows: readonly AuraRow[];
  players: readonly RotationTimelinePlayer[];
  spellMeta: (spellId: number | null) => SpellMeta;
}

/**
 * Auras that were up the whole fight (or not at all) for every player, as
 * icon groups: both players, A only, B only (design: Rotations 2a).
 */
function WholeFightRow({ rows, players, spellMeta }: WholeFightRowProps) {
  const full = (row: AuraRow, slot: number) => (row.uptime[slot] ?? 0) >= FULL_UPTIME;
  const groups =
    players.length === 2
      ? [
          { label: "Both", color: undefined, slot: null, items: rows.filter((r) => full(r, 0) && full(r, 1)) },
          { label: `${players[0].name} only`, color: SLOT_TEXT_COLORS[0], slot: 0, items: rows.filter((r) => full(r, 0) && !full(r, 1)) },
          { label: `${players[1].name} only`, color: SLOT_TEXT_COLORS[1], slot: 1, items: rows.filter((r) => !full(r, 0) && full(r, 1)) },
        ]
      : [{ label: players[0]?.name ?? "", color: SLOT_TEXT_COLORS[0], slot: 0, items: [...rows] }];
  return (
    <div
      className="grid h-[30px] border-t border-border bg-muted/30"
      style={{ gridTemplateColumns: `${LABEL_WIDTH}px minmax(0,1fr)` }}
      title="Auras that were up for the entire fight or not at all, for every player"
    >
      <div className="flex items-center gap-2 pl-4 pr-3">
        <span>Whole fight</span>
        <span className="font-mono text-[10px] text-muted-foreground">{rows.length}</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">100 / 0%</span>
      </div>
      <div className="styled-scrollbar flex items-center gap-4 overflow-x-auto border-l border-border px-2.5 text-[10px] text-muted-foreground">
        {groups
          .filter((g) => g.items.length > 0)
          .map((g) => (
            <span key={g.label} className="flex shrink-0 items-center gap-[3px]">
              <span className="mr-[3px]" style={{ color: g.color }}>
                {g.label}
              </span>
              {g.items.map((row) => {
                const meta = spellMeta(row.spellId);
                return (
                  <span
                    key={row.key}
                    className="flex rounded-[2px]"
                    style={g.slot != null ? { boxShadow: `0 2px 0 ${SLOT_COLORS[g.slot]}` } : undefined}
                  >
                    <AuraIcon meta={meta} name={row.name} size={16} />
                  </span>
                );
              })}
            </span>
          ))}
      </div>
    </div>
  );
}

/**
 * Aura icon with the spell tooltip. Spells whose data has no icon (some
 * passive talents) or no data at all get the placeholder icon instead of
 * rendering nothing.
 */
export function AuraIcon({ meta, name, size }: { meta: SpellMeta; name: string; size: number }) {
  const placeholder = (
    <span
      title={meta.spell ? undefined : name}
      className="block shrink-0 rounded-[2px] bg-muted bg-cover bg-center"
      style={{ width: size, height: size, backgroundImage: `url(${meta.icon})` }}
    />
  );
  if (!meta.spell) return placeholder;
  if (!meta.spell.spell_icon?.TextureFilename) {
    return (
      <SpellIconWithTooltip spell={meta.spell} detailed>
        {placeholder}
      </SpellIconWithTooltip>
    );
  }
  return <SpellIconWithTooltip spell={meta.spell} size={size} detailed className="rounded-[2px]" />;
}
