import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { alignOffsetMs, playerCasts } from "../../EventsPanels/RotationTimeline/derive";
import { SLOT_COLORS } from "../../EventsPanels/RotationTimeline/format";
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

const VISIBLE_ROWS = 10;
const LABEL_WIDTH = 220;

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
}

export function AuraSection({ players, view, spellMeta, unitName }: AuraSectionProps) {
  const [open, setOpen] = useState(true);
  const { durationMs } = view;

  const offsets = useMemo(
    () => players.map((p) => alignOffsetMs(playerCasts(p.data), view.align, view.ignored)),
    [players, view.align, view.ignored],
  );

  const buffs = useMemo(
    () => buildRows(players.map((p) => p.data.aurasOn.filter((a) => a.isBuff)), durationMs),
    [players, durationMs],
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
  const [pickedTarget, setPickedTarget] = useState<string | null>(null);
  const target = pickedTarget && targets.includes(pickedTarget) ? pickedTarget : (targets[0] ?? null);

  const debuffs = useMemo(
    () => (target ? buildRows(players.map((p) => p.data.debuffsCast.filter((a) => a.target === target)), durationMs) : []),
    [players, target, durationMs],
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
        >
          <AuraGroup title="Buffs" rows={buffs} offsets={offsets} P={P} spellMeta={spellMeta} />
          <div className="flex h-10 items-center gap-2 border-t border-border px-4 text-[11px] text-muted-foreground">
            <span className="text-[10px] uppercase tracking-wider">Debuffs on</span>
            {targets.length === 0 ? (
              <span>No debuffs attributed to these players</span>
            ) : (
              <select
                value={target ?? ""}
                onChange={(e) => setPickedTarget(e.target.value)}
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
          <AuraGroup title={null} rows={debuffs} offsets={offsets} P={P} spellMeta={spellMeta} />
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
  rows: AuraRow[];
  offsets: number[];
  P: (ms: number) => number;
  spellMeta: (spellId: number | null) => SpellMeta;
}

function AuraGroup({ title, rows, offsets, P, spellMeta }: AuraGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? rows : rows.slice(0, VISIBLE_ROWS);
  const grid = { gridTemplateColumns: `${LABEL_WIDTH}px minmax(0,1fr)` };
  return (
    <div>
      {title && (
        <div className="flex h-5 items-end px-4 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{title}</div>
      )}
      {shown.map((row) => (
        <div key={row.key} className="grid h-[30px] border-t border-border" style={grid}>
          <div className="flex min-w-0 items-center gap-1.5 pl-4 pr-3">
            <span
              className="size-3.5 shrink-0 rounded-[2px] bg-muted bg-cover bg-center"
              style={{ backgroundImage: `url(${spellMeta(row.spellId).icon})` }}
            />
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
                    className="absolute h-2.5 border-l-2"
                    style={{
                      top: slot === 0 ? 4 : 16,
                      left: `${left}%`,
                      width: `${Math.max(0.2, right - left)}%`,
                      borderColor: SLOT_COLORS[slot],
                      background: `color-mix(in oklab, ${SLOT_COLORS[slot]} 55%, transparent)`,
                    }}
                  />
                );
              }),
            )}
          </div>
        </div>
      ))}
      {rows.length > VISIBLE_ROWS && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex h-[30px] w-full items-center gap-2 border-t border-border px-4 text-left text-muted-foreground hover:bg-muted/50"
        >
          <ChevronRight className={cn("size-3", expanded && "rotate-90")} />
          {expanded ? "Show fewer" : `${rows.length - VISIBLE_ROWS} more`}
        </button>
      )}
      {rows.length === 0 && <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">None</div>}
    </div>
  );
}
