import { FlaskConical } from "lucide-react";
import { Link } from "react-router-dom";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { SpellIdTooltip } from "@/components/ui/SpellIdTooltip/SpellIdTooltip";
import { useCachedValue } from "@/hooks/useCachedValue";
import { GenericPanel } from "../GenericPanel";
import type { PanelDefinition, PanelRenderProps } from "../types";
import {
  consumablesTotalProcessor,
  type ConsumablesResult,
} from "./consumables.processor";
import { aggregateConsumablesTotal, type ConsumableCount } from "./consumablesTotal";

function ConsumeCount({ consume }: { consume: ConsumableCount }) {
  const content = (
    <span className="inline-flex items-center gap-1.5 rounded border border-border/60 bg-muted/30 px-2 py-1">
      <SpellIdTooltip spellId={consume.spellId} name={consume.name} size={18} />
      <span className="font-semibold text-foreground">x{consume.count}</span>
      {consume.spellId !== null && (
        <span className="font-mono text-2xs text-muted-foreground">#{consume.spellId}</span>
      )}
    </span>
  );

  if (consume.spellId === null) return content;

  return (
    <Link
      to={`/wowdb/spell/${consume.spellId}`}
      className="hover:border-foreground/30 hover:brightness-110"
      title={`Open spell ${consume.spellId}`}
    >
      {content}
    </Link>
  );
}

type ConsumablesTotalContentProps = PanelRenderProps<ConsumablesResult>;

export function ConsumablesTotalContent(props: ConsumablesTotalContentProps) {
  const { result, context, loading } = props;
  const { cachedValue: cachedResult, hasCache: hasData } = useCachedValue(
    result,
    (value) => !!value && value.uses instanceof Map && value.uses.size > 0,
    [props.panelContextVersion],
  );

  const rows = aggregateConsumablesTotal(cachedResult?.uses.values() ?? []);
  rows.sort((a, b) => {
    const aName = context.instance.players?.[a.playerId]?.name ?? a.playerId;
    const bName = context.instance.players?.[b.playerId]?.name ?? b.playerId;
    return aName.localeCompare(bName);
  });

  const effectiveProps = {
    ...props,
    loading: hasData ? false : props.loading,
    processing: hasData ? false : props.processing,
  };

  return (
    <GenericPanel {...effectiveProps}>
      {rows.length === 0 ? (
        <div className="py-4 text-center text-xs text-muted-foreground">
          {loading ? "Loading..." : "No consumable uses recorded"}
        </div>
      ) : (
        <ScrollArea className="h-full min-h-0">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-muted-foreground">
                <th className="w-40 px-2 py-1.5 text-left font-medium">Player</th>
                <th className="w-14 px-2 py-1.5 text-right font-medium">Total</th>
                <th className="px-2 py-1.5 text-left font-medium">Consumes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const player = context.instance.players?.[row.playerId];
                return (
                  <tr key={row.playerId} className="border-b border-border/20 align-top hover:bg-muted/30">
                    <td className="px-2 py-2 font-medium">
                      <span style={{ color: `var(--color-class-${(player?.class ?? "unknown").toLowerCase()})` }}>
                        {player?.name ?? row.playerId}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">{row.total}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex flex-wrap gap-1.5">
                        {row.consumes.map((consume) => (
                          <ConsumeCount key={consume.key} consume={consume} />
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
      )}
    </GenericPanel>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, react-refresh/only-export-components
export function createConsumablesTotalPanel(): PanelDefinition<ConsumablesResult, any> {
  return {
    ...consumablesTotalProcessor,
    label: "Consumes Total",
    icon: <FlaskConical className="h-4 w-4" />,
    underConstruction: true,
    supportsFiltering: true,
    defaultFilters: [
      { type: "source_type" as const, value: ["player"], applyTo: ["consume"] },
    ],
    render: (props) => <ConsumablesTotalContent {...props} />,
  };
}
