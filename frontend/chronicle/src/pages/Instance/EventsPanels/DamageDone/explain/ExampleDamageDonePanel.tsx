/**
 * The Damage Done panel rendered on deterministic fixture data — the
 * explainer's "example mode". Production DamageDoneContent, zero API calls
 * (parse pills and spell data come from fixture overrides).
 */

import { useMemo, useState } from "react";
import { Switch } from "@/components/ui/Switch/Switch";
import { DamageDoneContent } from "../DamageDoneContent";
import {
  FIXTURE_DURATION_MS,
  getFixtureParsePillsMap,
  getFixtureRenderProps,
  getFixtureSpellDataMap,
} from "./fixture";

export function ExampleDamageDonePanel() {
  const [perSecond, setPerSecond] = useState(false);

  const renderProps = useMemo(() => getFixtureRenderProps(), []);
  const parsePills = useMemo(() => getFixtureParsePillsMap(), []);
  const spellData = useMemo(() => getFixtureSpellDataMap(), []);

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-4 py-2.5">
        <span className="font-wow text-[13.5px]">Damage Done</span>
        <span className="font-mono text-[10px] text-muted-foreground">EXAMPLE RAID</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11.5px] text-muted-foreground">Per second</span>
          <Switch checked={perSecond} onCheckedChange={setPerSecond} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <DamageDoneContent
          {...renderProps}
          perSecond={perSecond}
          checkboxChecked={perSecond}
          parsePillsOverride={parsePills}
          spellDataOverride={spellData}
        />
      </div>
      <div className="flex flex-shrink-0 items-center border-t border-border px-4 py-1.5">
        <span className="font-mono text-[10.5px] text-muted-foreground">
          500 events · example data
        </span>
        <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">
          {Math.round(FIXTURE_DURATION_MS / 1000)}s encounter
        </span>
      </div>
    </div>
  );
}
