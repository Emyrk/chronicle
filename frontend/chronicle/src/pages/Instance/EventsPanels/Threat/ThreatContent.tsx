import type { PanelRenderProps } from "../types";
import { buildThreatView, type ThreatLogEntry, type ThreatResult, type ThreatView } from "./threat.processor";
import { ThreatEstimatedLabel, ThreatMeter } from "./ThreatMeter";

function formatOffset(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function describe(entry: ThreatLogEntry, name: (guid: string) => string): string {
  switch (entry.kind) {
    case "aggro":
      return `${name(entry.enemy)} turns from ${name(entry.from ?? "")} to ${name(entry.unit)}` +
        (entry.ratio !== undefined ? ` (est. ${Math.round(entry.ratio * 100)}% of ${name(entry.from ?? "")})` : "");
    case "taunt":
      return `${name(entry.unit)} taunts ${name(entry.enemy)}`;
    case "force":
      return entry.enemy ? `${name(entry.unit)} forces ${name(entry.enemy)}` : `${name(entry.unit)} forces every enemy`;
    case "drop":
      return `${name(entry.unit)} drops threat`;
    case "fade":
      return `${name(entry.unit)} fades`;
    case "death":
      return `${name(entry.unit)} dies, threat reset`;
    case "boss":
      return `${name(entry.enemy)} knocks ${name(entry.unit)} down the table`;
  }
}

export function ThreatContent({ result, context }: PanelRenderProps<ThreatResult>) {
  const view: ThreatView | null = buildThreatView(result, context.selectedEncounterIds, context.entitySelection.enemyIds);
  if (!view) {
    return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No threat yet</div>;
  }
  const encounter = result.encounters.get(view.encounterId);
  const name = (guid: string) => result.units.get(guid)?.name ?? encounter?.tables.get(guid)?.name ?? guid;
  const log = view.log.filter((entry) => !entry.enemy || entry.enemy === view.enemy);
  return (
    <div className="styled-scrollbar flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-2" data-threat-panel>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-medium">{view.enemyName}</span>
        <ThreatEstimatedLabel />
      </div>
      <ThreatMeter view={view} limit={view.rows.length} openLabel={view.enemyName} />
      {log.length > 0 && (
        <ul className="flex flex-col gap-0.5 border-t border-border pt-2 text-[11px] text-muted-foreground">
          {log.map((entry, index) => (
            <li key={index} className="flex gap-2">
              <span className="font-mono">{formatOffset(entry.offsetMs)}</span>
              <span>{describe(entry, name)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
