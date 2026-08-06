import { BarChart3, HelpCircle, MoreVertical } from "lucide-react";
import { useMemo, useState } from "react";
import { Switch } from "@/components/ui/Switch/Switch";
import { ComparisonContent } from "./ComparisonContent";
import {
  getComparisonFixtureEntries,
  getComparisonFixtureRenderProps,
  getHunterComparisonEntries,
} from "./explain/fixture";

export function ComparisonDemo({
  panelOption: controlledPanelOption,
  pickerOpen,
  variant = "generic",
}: {
  panelOption?: string | null;
  pickerOpen?: boolean;
  /** "generic" = Damage/Healing/Taken panels. "hunters" = two focused hunters. */
  variant?: "generic" | "hunters";
}) {
  const [internalPanelOption, setInternalPanelOption] = useState<string | null>(
    "panel-1,panel-2",
  );
  const [perSecond, setPerSecond] = useState(false);
  const panelOption =
    controlledPanelOption === undefined
      ? internalPanelOption
      : controlledPanelOption;
  const entries = useMemo(
    () =>
      variant === "hunters"
        ? getHunterComparisonEntries()
        : getComparisonFixtureEntries(),
    [variant],
  );
  const renderProps = useMemo(
    () => getComparisonFixtureRenderProps(panelOption),
    [panelOption],
  );

  return (
    <section className="relative flex h-[430px] w-[620px] flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <BarChart3 className="h-4 w-4" />
        <span className="text-sm font-medium">Comparison</span>
        <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          Per second
          <Switch
            checked={perSecond}
            onCheckedChange={setPerSecond}
            size="sm"
          />
        </label>
      </header>
      <div className="min-h-0 flex-1 p-2">
        <ComparisonContent
          {...renderProps}
          panelOption={panelOption}
          setPanelOption={
            controlledPanelOption === undefined
              ? setInternalPanelOption
              : () => {}
          }
          perSecond={perSecond}
          checkboxChecked={perSecond}
          entriesOverride={entries}
          pickerOpenOverride={pickerOpen}
          disableChartTransitionsOverride
        />
      </div>
      <footer className="flex h-8 shrink-0 items-center border-t border-border px-3 font-mono text-[10.5px] text-muted-foreground">
        Combines chart data already published by the selected panels
      </footer>
    </section>
  );
}
