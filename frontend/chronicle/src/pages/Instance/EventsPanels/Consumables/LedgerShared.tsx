/**
 * Shared presentational pieces for the consumables ledger panels
 * (raid-scope Consumes Used and player-scope Player Consumes).
 *
 * The visual language, from the design doc:
 *  - the bar is always uses, never gold;
 *  - gold is a right-hand number that reads "—" when unpriced;
 *  - ambiguous is a bucket below a rule, hatched icon, never a normal row.
 */

import { cn } from "@/lib/utils";
import { ItemCell } from "./ConsumablesContent";
import {
  formatGold,
  type LedgerAmbiguousRow,
  type LedgerItemRow,
} from "./consumablesLedger";

const COVERAGE_TONE_CLASS = {
  muted: "text-muted-foreground/70",
  warn: "text-amber-400",
  ok: "text-emerald-400/80",
} as const;

export function CoverageLine({ label, tone }: { label: string; tone: keyof typeof COVERAGE_TONE_CLASS }) {
  return <span className={cn("font-mono text-2xs", COVERAGE_TONE_CLASS[tone])}>{label}</span>;
}

export function UsesBar({ fraction, subtitle }: { fraction: number; subtitle: string }) {
  return (
    <div className="flex items-center gap-2 pl-6">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted/40">
        <div
          className="h-full rounded-full bg-foreground/30"
          style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }}
        />
      </div>
      <span className="shrink-0 font-mono text-2xs text-muted-foreground/70">{subtitle}</span>
    </div>
  );
}

export function GoldCell({ totalCopper, unitCopper }: { totalCopper: number | null; unitCopper: number | null }) {
  return (
    <div className="flex w-16 shrink-0 flex-col items-end gap-0.5">
      <span className={cn("font-mono text-xs", totalCopper === null ? "text-muted-foreground/50" : "text-amber-300/90")}>
        {totalCopper === null ? "—" : formatGold(totalCopper)}
      </span>
      <span className="font-mono text-2xs text-muted-foreground/60">
        {unitCopper === null ? "no price" : `${formatGold(unitCopper)} ea`}
      </span>
    </div>
  );
}

export function LedgerRow({
  row,
  maxUses,
  subtitle,
  showGold,
}: {
  row: LedgerItemRow;
  maxUses: number;
  /** Under-bar fact: "N players" at raid scope, "N fights" at player scope. */
  subtitle: string;
  showGold: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 px-2 py-1">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="min-w-0 flex-1 text-xs">
            <ItemCell itemId={row.itemId} link />
          </div>
          <span className="shrink-0 font-mono text-xs text-foreground">{row.uses}×</span>
        </div>
        <UsesBar fraction={maxUses > 0 ? row.uses / maxUses : 0} subtitle={subtitle} />
      </div>
      {showGold && <GoldCell totalCopper={row.totalCopper} unitCopper={row.unitCopper} />}
    </div>
  );
}

/** Hatched square marking an unresolved bucket. */
function AmbiguousIcon() {
  return (
    <span
      className="h-4.5 w-4.5 shrink-0 rounded border border-border/80"
      style={{
        background:
          "repeating-linear-gradient(45deg, color-mix(in srgb, currentColor 14%, transparent) 0 3px, transparent 3px 6px)",
      }}
    />
  );
}

export function AmbiguousSection({
  rows,
  totalAmbiguousUses,
  showGold,
}: {
  rows: LedgerAmbiguousRow[];
  totalAmbiguousUses: number;
  showGold: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 border-t border-border/60 bg-muted/10 px-2 pb-2 pt-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Ambiguous</span>
        <span className="font-mono text-2xs text-muted-foreground/70">
          {totalAmbiguousUses} use{totalAmbiguousUses === 1 ? "" : "s"} in {rows.length} unresolved bucket{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      {rows.map((row) => (
        <div key={row.key} className="flex items-start gap-2.5">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <AmbiguousIcon />
              <span className="min-w-0 flex-1 truncate text-xs">
                {row.spellName || "Unknown consumable"}
              </span>
              <span className="shrink-0 font-mono text-xs">{row.uses}×</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-6 text-2xs text-muted-foreground/70">
              {row.candidateItemIds.length > 0 ? (
                <>
                  <span>could be</span>
                  {row.candidateItemIds.map((itemId) => (
                    <ItemCell key={itemId} itemId={itemId} link compact />
                  ))}
                </>
              ) : (
                <span>effect seen, no item candidates in log</span>
              )}
            </div>
          </div>
          {/* An unresolved buff has no single price by definition. */}
          {showGold && <GoldCell totalCopper={null} unitCopper={null} />}
        </div>
      ))}
    </div>
  );
}
