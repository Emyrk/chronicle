import { useSpell } from "@/api/queries";
import { SpellIconWithTooltip } from "@/components/ui/SpellIconWithTooltip";
import { useDatasetId } from "@/hooks/useDatasetId";
import { cn } from "@/lib/utils";
import { classColor } from "../Consumables/consumablesLedgerLogic";
import { cooldownStateAt, normalizeClassName, type CooldownStateAt, type CooldownUsageRow } from "./cooldownUsage";

/**
 * The Cooldown Usage panel at one moment, for a map meter window: every
 * player's cooldowns, bright while ready, dimmed with a clock sweep and the
 * time left while cooling. Rows are the panel's own (casts from the whole log
 * carry in, classmates' cooldowns included), sorted by player.
 */
export function CooldownsNow({ rows, atMs }: { rows: readonly CooldownUsageRow[]; atMs: number }) {
  const players: CooldownUsageRow[][] = [];
  for (const row of rows) {
    const last = players[players.length - 1];
    if (last && last[0].playerID === row.playerID) last.push(row);
    else players.push([row]);
  }
  if (players.length === 0) return <div className="p-3 text-center text-[11px] text-white/50">No cooldowns cast in this log.</div>;
  return (
    <div className="flex flex-col gap-0.5 p-1">
      {players.map((group) => {
        const player = group[0];
        const states = group.map((row) => cooldownStateAt(row, atMs));
        const ready = states.filter((state) => state.ready).length;
        return (
          <div key={player.playerID} className="flex items-center gap-1.5">
            <span className="flex w-24 min-w-0 shrink-0 items-center gap-1 text-[11px]">
              <span className="h-3 w-[3px] shrink-0 rounded-sm" style={{ background: classColor(normalizeClassName(player.className)) }} />
              <span className="truncate">{player.playerName}</span>
            </span>
            <span className="w-7 shrink-0 text-right font-mono text-[10px] text-white/50" title={`${ready} of ${group.length} cooldowns ready`}>
              {ready}/{group.length}
            </span>
            <span className="flex flex-wrap gap-1">
              {group.map((row, index) => <CooldownChip key={row.cooldown.key} row={row} state={states[index]} />)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CooldownChip({ row, state }: { row: CooldownUsageRow; state: CooldownStateAt }) {
  const datasetId = useDatasetId();
  const { data: spell } = useSpell(String(row.cooldown.spellId), datasetId);
  const left = Math.min(1, state.remainingMs / Math.max(1, row.cooldown.cooldownMs));
  return (
    <span
      className={cn("relative block size-5 overflow-hidden rounded-sm", state.ready ? "ring-1 ring-emerald-400/80" : "opacity-90")}
      title={`${row.cooldown.name}: ${state.ready ? "ready" : `${formatLeft(state.remainingMs)} left`}`}
    >
      {spell ? (
        <SpellIconWithTooltip spell={spell} size={20} className={cn("size-5", !state.ready && "grayscale")} />
      ) : (
        <span className="block size-5 bg-white/10" />
      )}
      {!state.ready && (
        <>
          {/* The clock sweep: the part still to run, dark, as WoW draws a cooldown. */}
          <span className="pointer-events-none absolute inset-0" style={{ background: `conic-gradient(rgba(0,0,0,.7) ${left * 100}%, transparent 0)` }} />
          <span className="pointer-events-none absolute inset-0 grid place-items-center font-mono text-[9px] font-semibold text-white [text-shadow:0_0_2px_#000]">
            {formatLeft(state.remainingMs)}
          </span>
        </>
      )}
    </span>
  );
}

// "45" seconds under a minute, else whole minutes, rounded up: "3m".
function formatLeft(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return seconds < 60 ? String(seconds) : `${Math.ceil(seconds / 60)}m`;
}
