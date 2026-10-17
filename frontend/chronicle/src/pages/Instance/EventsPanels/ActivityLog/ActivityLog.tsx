/* eslint-disable react-refresh/only-export-components -- Panel factory and colocated view components intentionally share this module. */
import { useState } from "react";
import { ScrollText } from "lucide-react";
import { SpellIdTooltip } from "@/components/ui/SpellIdTooltip";
import { cn } from "@/lib/utils";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import { GenericPanel } from "../GenericPanel";
import { schoolColor } from "../Map/replayEffects";
import type { PanelDefinition, PanelRenderProps } from "../types";
import {
  activityLogProcessor,
  activityMatches,
  recentActivity,
  type ActivityEntry,
  type ActivityFilter,
  type ActivityLogEncounter,
  type ActivityLogProcessorEvent,
  type ActivityLogResult,
} from "./activityLog.processor";

const FILTERS: { value: ActivityFilter; label: string; title: string }[] = [
  { value: "highlights", label: "Highlights", title: "Crits, deaths, interrupts, resurrects and enemy casts" },
  { value: "all", label: "All", title: "Everything" },
  { value: "damage", label: "Damage", title: "Damage that landed" },
  { value: "healing", label: "Healing", title: "Heals" },
  { value: "auras", label: "Auras", title: "Buffs and debuffs gained and faded" },
  { value: "casts", label: "Casts", title: "Completed casts" },
];
const FILTER_PREFIX = "f:";
const HEAL_COLOR = "var(--color-school-nature)";
const CRIT_COLOR = "#facc15";
const OVERHEAL_COLOR = "#71717a";

function parseFilter(panelOption: string | null | undefined): ActivityFilter | null {
  const token = (panelOption ?? "").split(",").find((part) => part.startsWith(FILTER_PREFIX))?.slice(FILTER_PREFIX.length);
  return FILTERS.some((filter) => filter.value === token) ? token as ActivityFilter : null;
}

function selectEncounter(
  encounters: ReadonlyMap<string, ActivityLogEncounter>,
  selectedEncounterIds: readonly string[],
  timestampMs: number | null,
): ActivityLogEncounter | null {
  const selected = selectedEncounterIds
    .map((id) => encounters.get(id))
    .filter((encounter): encounter is ActivityLogEncounter => Boolean(encounter));
  if (timestampMs !== null) {
    const atCursor = selected.find((encounter) => encounter.startMs <= timestampMs && timestampMs <= encounter.endMs);
    if (atCursor) return atCursor;
  }
  return selected[selected.length - 1] ?? null;
}

function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function ActivityLogContent(props: PanelRenderProps<ActivityLogResult>) {
  const overlay = props.variant === "overlay";
  const sync = useSyncModeContextOptional();
  const [filter, setFilterState] = useState<ActivityFilter>(() => parseFilter(props.panelOption) ?? "highlights");
  const setFilter = (next: ActivityFilter) => {
    setFilterState(next);
    props.setPanelOption?.(`${FILTER_PREFIX}${next}`);
  };

  const cursorMs = sync?.enabled && sync.currentTimestamp ? sync.currentTimestamp.getTime() : null;
  const encounter = selectEncounter(props.result.encounters, props.context.selectedEncounterIds, cursorMs);
  const players = props.context.instance.players ?? {};
  const units = props.context.instance.units ?? {};
  const ownerOf = (guid: string) => units[guid]?.owner?.toString();
  // Players and their pets: not enemies.
  const isFriendly = (guid: string) => Boolean(players[guid]) || Boolean(players[ownerOf(guid) ?? ""]);
  const rows = encounter
    ? recentActivity(encounter.entries, cursorMs ?? encounter.endMs, overlay ? 40 : 150, (line) => activityMatches(line, filter, isFriendly))
    : [];

  const nameOf = (guid: string) => players[guid]?.name ?? units[guid]?.name ?? (guid ? "Unknown" : "");
  const colorOf = (guid: string) => {
    if (players[guid]) return getClassColorVar(players[guid].class);
    const owner = ownerOf(guid);
    if (owner && players[owner]) return "#67e8f9";
    return "var(--color-class-enemy)";
  };

  return (
    <GenericPanel {...props}>
      <div className={cn("flex min-h-0 flex-1 flex-col", overlay ? "gap-0.5" : "gap-1.5")}>
        <div role="tablist" aria-label="Activity" className="flex shrink-0 flex-wrap gap-0.5">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={filter === option.value}
              title={option.title}
              onClick={() => setFilter(option.value)}
              className={cn(
                "rounded-sm border",
                overlay ? "px-1 py-px text-[10px]" : "px-2 py-0.5 text-xs",
                filter === option.value
                  ? "border-primary-darker bg-primary-darker text-foreground"
                  : "border-white/10 text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className={cn("styled-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden font-mono", overlay ? "text-[10px]" : "text-xs")}>
          {rows.length === 0 ? (
            <div className="px-1 py-2 font-sans text-muted-foreground">{encounter ? "Nothing yet" : "No activity for the selected encounter"}</div>
          ) : rows.map((line, index) => (
            <ActivityRow
              key={`${line.timestampMs}-${index}`}
              line={line}
              startMs={encounter?.startMs ?? 0}
              nameOf={nameOf}
              colorOf={colorOf}
              striped={index % 2 === 1}
              dense={overlay}
            />
          ))}
        </div>
      </div>
    </GenericPanel>
  );
}

function ActivityRow({
  line,
  startMs,
  nameOf,
  colorOf,
  striped,
  dense,
}: {
  line: ActivityEntry;
  startMs: number;
  nameOf: (guid: string) => string;
  colorOf: (guid: string) => string;
  striped: boolean;
  dense: boolean;
}) {
  const heal = line.kind === "heal";
  const spellColor = heal ? HEAL_COLOR : line.kind === "aura_fade" ? "var(--muted-foreground)" : line.school ? schoolColor(line.school) : "var(--foreground)";
  const source = line.source ? <span className="truncate" style={{ color: colorOf(line.source) }}>{nameOf(line.source)}</span> : null;
  const target = line.target ? <span className="truncate" style={{ color: colorOf(line.target) }}>{nameOf(line.target)}</span> : null;
  const spell = line.spellName ? (
    <span className="flex min-w-0 items-center gap-1 truncate [&_img]:shrink-0" style={{ color: spellColor }}>
      <SpellIdTooltip spellId={line.spellId} name={line.spellName} size={dense ? 12 : 14} />
    </span>
  ) : null;

  let what: React.ReactNode;
  let amount: React.ReactNode = null;
  switch (line.kind) {
    case "damage":
    case "heal":
      what = <>{source}{spell}<Arrow />{target}</>;
      amount = (
        <span className="shrink-0 tabular-nums">
          <span
            className={cn(line.crit && "font-bold")}
            // Crits in yellow; a heal that restored nothing in grey.
            style={{ color: line.crit ? CRIT_COLOR : heal && line.amount === 0 ? OVERHEAL_COLOR : heal ? HEAL_COLOR : undefined }}
          >
            {heal ? "+" : ""}{line.amount.toLocaleString()}{line.crit ? "*" : ""}
          </span>
          {heal && line.overheal > 0 && (
            <span style={{ color: OVERHEAL_COLOR }}> ({line.overheal.toLocaleString()} oh)</span>
          )}
        </span>
      );
      break;
    case "cast":
      what = <>{source}{spell}{line.target && line.target !== line.source ? <><Arrow />{target}</> : null}</>;
      break;
    case "aura_gain":
    case "aura_fade":
      what = <>{target}<span className="shrink-0 text-muted-foreground">{line.kind === "aura_gain" ? "+" : "−"}</span>{spell}</>;
      break;
    case "death":
      what = <>{target}<span className="shrink-0 text-red-400">☠ died</span>{line.source ? <><span className="shrink-0 text-muted-foreground">to</span>{source}</> : null}</>;
      break;
    case "interrupt":
      what = <>{source}<span className="shrink-0 text-amber-300">interrupted</span>{target}{spell}</>;
      break;
    case "resurrect":
      what = <>{source}<span className="shrink-0 text-emerald-300">resurrected</span>{target}</>;
      break;
  }

  return (
    <div className={cn("flex min-w-0 items-center gap-1.5 whitespace-nowrap", dense ? "px-0.5 py-px" : "px-1 py-0.5", striped && "bg-white/[0.025]")}>
      <span className="shrink-0 text-muted-foreground">{formatClock(line.timestampMs - startMs)}</span>
      <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">{what}</span>
      {amount}
    </div>
  );
}

function Arrow() {
  return <span className="shrink-0 text-muted-foreground">›</span>;
}

export function createActivityLogPanel(): PanelDefinition<ActivityLogResult, ActivityLogProcessorEvent> {
  return {
    ...activityLogProcessor,
    label: "Activity Log",
    icon: <ScrollText className="h-4 w-4" />,
    keybinds: [],
    syncDataMode: "full",
    disableCardFlip: true,
    supportsFiltering: false,
    renderOnlyOptionTokens: [FILTER_PREFIX],
    render: (props) => <ActivityLogContent {...props} />,
  };
}
