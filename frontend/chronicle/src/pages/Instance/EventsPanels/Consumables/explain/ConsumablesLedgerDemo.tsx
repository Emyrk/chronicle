import { Coins, User } from "lucide-react";
import { useMemo, useState } from "react";
import { Switch } from "@/components/ui/Switch/Switch";
import { ConsumablesLedgerContent } from "../ConsumablesLedger";
import { ConsumablesPlayerContent } from "../ConsumablesPlayer";
import { ConsumablesTotalContent } from "../ConsumablesTotal";
import type { ConsumablesResult } from "../consumables.processor";
import { getFixtureRenderProps } from "./fixture";

export function ConsumablesLedgerDemo({
  view,
  result,
}: {
  view?: "player" | "all" | "raid";
  result?: ConsumablesResult;
}) {
  const [raidWide, setRaidWide] = useState(view === "raid");
  const [panelOption, setPanelOption] = useState<string | null>(
    getFixtureRenderProps().panelOption ?? null,
  );
  const props = useMemo(() => getFixtureRenderProps(), []);
  const renderProps = result ? { ...props, result } : props;
  const useCount = renderProps.result.uses.size;
  const isRaidWide = view ? view === "raid" : raidWide;

  return (
    <div className="flex h-[430px] w-[620px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <Coins className="h-4 w-4" />
        <span className="text-sm font-medium">Consumes Used</span>
        <span className="font-mono text-[10px] text-muted-foreground">EXAMPLE RAID</span>
        <div className="ml-auto flex items-center gap-2" data-demo-raid-toggle>
          <span className="text-xs text-muted-foreground">Raid Wide</span>
          <Switch
            checked={isRaidWide}
            onCheckedChange={(checked) => {
              if (!view) setRaidWide(checked);
            }}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 p-2">
        {view === "all" ? (
          <ConsumablesTotalContent
            {...renderProps}
            checkboxChecked={false}
            perSecond={false}
            panelOption={panelOption}
            setPanelOption={setPanelOption}
            headerExtra={
              <button
                type="button"
                className="flex h-8 shrink-0 items-center gap-1.5 rounded border border-border px-2 text-xs text-muted-foreground"
                data-demo-consumables-single-player
              >
                <User className="h-3.5 w-3.5" />
                Single Player
              </button>
            }
          />
        ) : isRaidWide ? (
          <ConsumablesLedgerContent
            {...renderProps}
            checkboxChecked
            perSecond
            panelOption={panelOption}
            setPanelOption={setPanelOption}
          />
        ) : (
          <ConsumablesPlayerContent
            {...renderProps}
            checkboxChecked={false}
            perSecond={false}
            panelOption={panelOption}
            setPanelOption={setPanelOption}
          />
        )}
      </div>
      <div className="flex shrink-0 items-center border-t border-border px-4 py-1.5">
        <span className="font-mono text-[10.5px] text-muted-foreground">{useCount} uses · example data</span>
        <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">3 encounters</span>
      </div>
    </div>
  );
}
