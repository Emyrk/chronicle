import { useMemo } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Users } from "lucide-react";
import { useFriendlyClassBuffs } from "@/api/classBuffs";
import { useSpell } from "@/api/queries";
import { SpellIconWithTooltip } from "@/components/ui/SpellIconWithTooltip";
import { useDatasetId } from "@/hooks/useDatasetId";
import { cn } from "@/lib/utils";
import { ClassIcon } from "@/pages/RaidPlanner/ClassIcon";
import { classColor } from "../Consumables/consumablesLedgerLogic";
import { GenericPanel } from "../GenericPanel";
import type { PanelRenderProps } from "../types";
import { UNKNOWN_CASTER_ID, type FriendlyClassBuffsResult } from "./friendlyClassBuffs.processor";
import {
  buildAllowedFriendlyClassBuffs,
  buildFriendlyBuffMatrix,
  type FriendlyBuffMatrix,
  type FriendlyBuffMatrixCell,
  type FriendlyBuffMatrixColumn,
} from "./friendlyClassBuffsView";

const VIEW_PREFIX = "v:";
const CLASS_PREFIX = "c:";

type BuffView = "done" | "received";

interface PanelOptions {
  view: BuffView;
  className: string | null;
}

function parseOptions(option: string | null | undefined): PanelOptions {
  const tokens = option?.split(",").filter(Boolean) ?? [];
  const viewToken = tokens.find((token) => token.startsWith(VIEW_PREFIX))?.slice(VIEW_PREFIX.length);
  const className = tokens.find((token) => token.startsWith(CLASS_PREFIX))?.slice(CLASS_PREFIX.length) ?? null;
  return {
    view: viewToken === "received" ? "received" : "done",
    className,
  };
}

function serializeOptions(
  option: string | null | undefined,
  next: Partial<PanelOptions>,
): string | null {
  const current = parseOptions(option);
  const merged = { ...current, ...next };
  const tokens = (option?.split(",").filter(Boolean) ?? []).filter(
    (token) => !token.startsWith(VIEW_PREFIX) && !token.startsWith(CLASS_PREFIX),
  );
  if (merged.view !== "done") tokens.push(`${VIEW_PREFIX}${merged.view}`);
  if (merged.className) tokens.push(`${CLASS_PREFIX}${merged.className}`);
  return tokens.length > 0 ? tokens.join(",") : null;
}

function classLabel(className: string): string {
  return className === "DeathKnight" ? "Death Knight" : className;
}

function normalizeClassName(className: string): string {
  return className.toUpperCase().replace(/[^A-Z]/g, "");
}

function BuffIcon({ column }: { column: FriendlyBuffMatrixColumn }) {
  const datasetId = useDatasetId();
  const { data: spell } = useSpell(String(column.spellId), datasetId);
  return spell ? (
    <SpellIconWithTooltip spell={spell} size={20} className="size-5" />
  ) : (
    <span className="block size-5 rounded-sm border border-white/10 bg-black/25" title={column.name} />
  );
}

function cellTitle(
  playerName: string,
  column: FriendlyBuffMatrixColumn,
  cell: FriendlyBuffMatrixCell | undefined,
  view: BuffView,
): string {
  const count = cell?.applications ?? 0;
  const lines = [`${playerName} · ${column.name}: ${count}`];
  if (cell && cell.otherPlayers.length > 0) {
    const label = view === "done" ? "Recipients" : "Sources";
    lines.push(`${label}: ${cell.otherPlayers.map((player) => `${player.playerName} (${player.applications})`).join(", ")}`);
  }
  return lines.join("\n");
}

function BuffMatrixTable({ matrix, view }: { matrix: FriendlyBuffMatrix; view: BuffView }) {
  return (
    <table className="w-max border-separate border-spacing-0 text-xs">
      <thead>
        <tr>
          <th className="sticky left-0 top-0 z-20 bg-card px-2 py-1.5" />
          {matrix.columns.map((column) => (
            <th key={column.key} className="sticky top-0 z-20 bg-card px-1.5 py-1.5" title={column.name}>
              <span className="flex justify-center">
                <BuffIcon column={column} />
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {matrix.rows.map((row) => (
          <tr key={row.playerID} className="hover:bg-muted/30">
            <td className="sticky left-0 z-10 whitespace-nowrap border-t border-border/30 bg-card py-1 pl-1 pr-3">
              <span className="flex items-center gap-1.5 text-foreground">
                <span
                  className="h-3 w-[3px] rounded-sm"
                  style={{ background: classColor(normalizeClassName(row.className)) }}
                />
                {row.playerName}
              </span>
            </td>
            {matrix.columns.map((column) => {
              const cell = row.cells.get(column.key);
              const count = cell?.applications ?? 0;
              return (
                <td
                  key={column.key}
                  className={cn(
                    "border-t border-border/30 px-1.5 py-1 text-center font-mono",
                    count === 0 ? "text-muted-foreground/25" : "text-foreground",
                  )}
                  title={cellTitle(row.playerName, column, cell, view)}
                >
                  {count}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-5 text-center text-muted-foreground">
      <Users className="h-5 w-5 opacity-60" />
      <span>{message}</span>
    </div>
  );
}

export function FriendlyClassBuffsContent(props: PanelRenderProps<FriendlyClassBuffsResult>) {
  const { result, context, panelOption, setPanelOption } = props;
  const { data, isLoading, error } = useFriendlyClassBuffs();
  const options = parseOptions(panelOption);

  const raidClassCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const player of Object.values(context.instance.players ?? {})) {
      const className = normalizeClassName(player.class);
      counts.set(className, (counts.get(className) ?? 0) + 1);
    }
    return counts;
  }, [context.instance.players]);

  const classNames = useMemo(() => {
    const available = Object.keys(data ?? {}).filter((className) => className !== "Generic").sort();
    const inRaid = available.filter((className) => raidClassCounts.has(normalizeClassName(className)));
    return inRaid.length > 0 ? inRaid : available;
  }, [data, raidClassCounts]);

  const selectedClass = options.className && classNames.includes(options.className)
    ? options.className
    : (classNames[0] ?? null);
  const allowedSpells = useMemo(
    () => buildAllowedFriendlyClassBuffs(data, selectedClass),
    [data, selectedClass],
  );
  const matrix = useMemo(
    () => buildFriendlyBuffMatrix(
      options.view === "done" ? result.byCaster : result.byTarget,
      allowedSpells,
      {
        selectedPlayers: options.view === "received" ? context.entitySelection.playerIds : undefined,
        sourceClassName: selectedClass,
        sourceIsEntity: options.view === "done",
      },
    ),
    [allowedSpells, context.entitySelection.playerIds, options.view, result.byCaster, result.byTarget, selectedClass],
  );
  const unattributedApplications = options.view === "received"
    ? matrix.rows.reduce(
      (total, row) => total + [...row.cells.values()].reduce(
        (cellTotal, cell) => cellTotal + (cell.otherPlayers.find((player) => player.playerID === UNKNOWN_CASTER_ID)?.applications ?? 0),
        0,
      ),
      0,
    )
    : 0;

  return (
    <GenericPanel {...props}>
      <div className="flex h-full min-h-0 flex-col text-xs">
        <div className="flex flex-wrap items-center gap-1 border-b border-border/40 pb-2">
          {classNames.map((className) => {
            const normalized = normalizeClassName(className);
            const count = raidClassCounts.get(normalized) ?? 0;
            const active = className === selectedClass;
            return (
              <button
                key={className}
                type="button"
                onClick={() => setPanelOption?.(serializeOptions(panelOption, { className }))}
                title={`${classLabel(className)} · ${count} ${count === 1 ? "player" : "players"}`}
                aria-label={classLabel(className)}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px]",
                  active
                    ? "border-foreground/30 bg-muted text-foreground"
                    : "border-transparent text-muted-foreground opacity-60 hover:opacity-100",
                )}
              >
                {count}
                <ClassIcon cls={normalized} className="size-4 rounded-sm" />
              </button>
            );
          })}

          <div className="ml-auto inline-flex rounded border border-border/60 bg-background p-0.5">
            <button
              type="button"
              onClick={() => setPanelOption?.(serializeOptions(panelOption, { view: "done" }))}
              aria-pressed={options.view === "done"}
              className={cn(
                "flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px]",
                options.view === "done" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ArrowUpFromLine className="size-3" />
              Done
            </button>
            <button
              type="button"
              onClick={() => setPanelOption?.(serializeOptions(panelOption, { view: "received" }))}
              aria-pressed={options.view === "received"}
              className={cn(
                "flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px]",
                options.view === "received" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ArrowDownToLine className="size-3" />
              Received
            </button>
          </div>
        </div>

        {options.view === "received" && context.entitySelection.playerIds.size > 0 && (
          <div className="border-b border-border/30 py-1 text-[10px] text-muted-foreground">
            Showing {context.entitySelection.playerIds.size} selected {context.entitySelection.playerIds.size === 1 ? "player" : "players"}.
          </div>
        )}

        {error ? (
          <EmptyState message="Failed to load friendly class buff metadata." />
        ) : isLoading ? (
          <EmptyState message="Loading friendly class buffs…" />
        ) : classNames.length === 0 ? (
          <EmptyState message="No friendly class buff data is available for this dataset." />
        ) : matrix.rows.length === 0 ? (
          <EmptyState message={`No friendly buffs were ${options.view === "done" ? "applied" : "received"} in the selected encounters.`} />
        ) : (
          <div className="min-h-0 flex-1 overflow-auto styled-scrollbar">
            <BuffMatrixTable matrix={matrix} view={options.view} />
          </div>
        )}

        {unattributedApplications > 0 && (
          <div className="flex items-center gap-1.5 border-t border-border/40 py-1 text-[10px] text-amber-400">
            <AlertTriangle className="size-3" />
            {unattributedApplications} {unattributedApplications === 1 ? "application" : "applications"} could not be attributed to a caster.
          </div>
        )}
      </div>
    </GenericPanel>
  );
}
