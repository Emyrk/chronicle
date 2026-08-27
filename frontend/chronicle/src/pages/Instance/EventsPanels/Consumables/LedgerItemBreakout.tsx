/**
 * Floating per-item breakout for the raid-wide consumes ledger: who used the
 * item, how often, and how adoption splits by class. Opened by clicking a
 * ledger row; rendered inside FloatingIncomingEventsBreakout.
 */

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ItemCell } from "./ConsumablesContent";
import { CoinAmount } from "./CoinAmount";
import {
  classAbbreviation,
  classColor,
  summarizePlayerItemFights,
  type PlayerItemNamedEncounterRow,
} from "./consumablesLedgerLogic";

export interface BreakoutPlayerRow {
  guid: string;
  name: string;
  cls: string | undefined;
  uses: number;
}

export interface BreakoutClassStat {
  cls: string;
  /** Players of this class that used the item. */
  used: number;
  /** Players of this class in the raid. */
  of: number;
}

export interface LedgerItemBreakoutData {
  itemId: number;
  unitCopper: number | null;
  /** Panel-level price layout: when false the gold column never renders. */
  showGold: boolean;
  raidSize: number;
  rows: BreakoutPlayerRow[];
  /** Raid members with zero uses of the item, sorted by class then name. */
  nonUsers: BreakoutPlayerRow[];
  classes: BreakoutClassStat[];
}

export interface PlayerItemBreakoutData {
  itemId: number;
  playerName: string;
  cls: string | undefined;
  rows: PlayerItemNamedEncounterRow[];
}

/** Player-view breakout: which fights one player used the item in, and when. */
export function PlayerItemBreakout({ data, onClose }: { data: PlayerItemBreakoutData; onClose: () => void }) {
  const totalUses = data.rows.reduce((sum, row) => sum + row.uses.length, 0);
  const fightRows = summarizePlayerItemFights(data.rows);
  return (
    <div className="w-80 overflow-hidden rounded-lg border border-amber-500/25 bg-card shadow-2xl">
      <div className="flex cursor-grab items-center gap-2 border-b border-border bg-muted/30 px-3 py-2" data-drag-handle>
        <div className="min-w-0 flex-1">
          <div className="text-xs">
            <ItemCell itemId={data.itemId} link newTab />
          </div>
          <div className="mt-0.5 font-mono text-2xs text-muted-foreground/70">
            <span style={{ color: classColor(data.cls) }}>{data.playerName}</span>
            {" · "}
            {totalUses} use{totalUses === 1 ? "" : "s"} in {data.rows.length} fight{data.rows.length === 1 ? "" : "s"}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close item breakout"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-[var(--incoming-events-body-height)] overflow-y-auto py-1.5 styled-scrollbar">
        {fightRows.map((row) => (
          <div key={row.key} className="flex items-baseline gap-2 px-3 py-1">
            <span className="min-w-0 flex-1 truncate text-xs text-foreground/80">
              {row.label}
            </span>
            <span className="w-6 shrink-0 text-right font-mono text-xs text-foreground">
              {row.uses.length}×
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LedgerItemBreakout({ data, onClose }: { data: LedgerItemBreakoutData; onClose: () => void }) {
  const totalUses = data.rows.reduce((sum, row) => sum + row.uses, 0);
  const repeats = totalUses - data.rows.length;
  const maxUses = Math.max(1, ...data.rows.map((row) => row.uses));

  return (
    <div className="w-80 overflow-hidden rounded-lg border border-amber-500/25 bg-card shadow-2xl">
      <div className="flex cursor-grab items-center gap-2 border-b border-border bg-muted/30 px-3 py-2" data-drag-handle>
        <div className="min-w-0 flex-1">
          <div className="text-xs">
            <ItemCell itemId={data.itemId} link newTab />
          </div>
          <div className="mt-0.5 font-mono text-2xs text-muted-foreground/70">
            #{data.itemId}
            {data.showGold && (
              <>
                {" · "}
                {data.unitCopper === null ? (
                  "no price"
                ) : (
                  <><CoinAmount copper={data.unitCopper} /> each</>
                )}
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close item breakout"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div
        className="flex items-baseline justify-between gap-2 border-b border-border/60 px-3 py-2"
        data-demo-consumables-breakout-summary
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-foreground/80">
            {data.rows.length} of {data.raidSize} players · {totalUses} use{totalUses === 1 ? "" : "s"}
          </span>
          <span className="font-mono text-2xs text-muted-foreground/60">
            {repeats > 0 ? `${repeats} repeat use${repeats === 1 ? "" : "s"}` : "no repeats"}
          </span>
        </div>
        {data.showGold && (
          data.unitCopper === null ? (
            <span className="font-mono text-sm font-semibold text-muted-foreground/50">—</span>
          ) : (
            <CoinAmount copper={data.unitCopper * totalUses} className="text-sm font-semibold" />
          )
        )}
      </div>

      <div
        className="flex gap-2 border-b border-border/60 px-3 py-2"
        data-demo-consumables-breakout-classes
      >
        {data.classes.map((stat) => (
          <div key={stat.cls} className="flex min-w-0 flex-1 flex-col gap-1">
            <span
              className="font-mono text-2xs uppercase tracking-wider opacity-85"
              style={{ color: classColor(stat.cls) }}
            >
              {classAbbreviation(stat.cls)}
            </span>
            <div className="h-1 overflow-hidden rounded-sm bg-background/70">
              <div
                className="h-full rounded-sm opacity-75"
                style={{ width: `${(stat.used / stat.of) * 100}%`, background: classColor(stat.cls) }}
              />
            </div>
            <span className="font-mono text-2xs text-muted-foreground/60">
              {stat.used}/{stat.of}
            </span>
          </div>
        ))}
      </div>

      <div className="max-h-[var(--incoming-events-body-height)] overflow-y-auto py-1.5 styled-scrollbar">
        {data.rows.map((row) => (
          <div
            key={row.guid}
            className="flex items-center gap-2 px-3 py-1"
            data-demo-consumables-breakout-user
          >
            <span className="h-3 w-0.5 shrink-0 rounded-full" style={{ background: classColor(row.cls) }} />
            <span className="w-24 shrink-0 truncate text-xs text-foreground/80">{row.name}</span>
            <div className="h-1 flex-1 overflow-hidden rounded-sm bg-background/70">
              <div
                className="h-full rounded-sm opacity-55"
                style={{ width: `${(row.uses / maxUses) * 100}%`, background: classColor(row.cls) }}
              />
            </div>
            <span
              className={cn(
                "w-6 shrink-0 text-right font-mono text-xs",
                row.uses > 1 ? "text-foreground" : "text-muted-foreground/60",
              )}
            >
              {row.uses}×
            </span>
            {data.showGold && (
              data.unitCopper === null ? (
                <span className="w-11 shrink-0 text-right font-mono text-2xs text-muted-foreground/40">—</span>
              ) : (
                <CoinAmount
                  copper={data.unitCopper * row.uses}
                  className="w-11 shrink-0 text-right text-2xs"
                />
              )
            )}
          </div>
        ))}

        {data.nonUsers.length > 0 && (
          <div
            className="mt-1 border-t border-border/60 px-3 pb-0.5 pt-2"
            data-demo-consumables-breakout-nonusers
          >
            <div className="mb-1 font-mono text-2xs uppercase tracking-wider text-muted-foreground/60">
              Did not use · {data.nonUsers.length}
            </div>
            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
              {data.nonUsers.map((row) => (
                <span
                  key={row.guid}
                  className="text-2xs opacity-75"
                  style={{ color: classColor(row.cls) }}
                >
                  {row.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
