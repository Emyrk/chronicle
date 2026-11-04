import { Info } from "lucide-react";
import type { PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { formatNumber } from "@/lib/format";
import { MeterBars } from "../MeterBars";
import type { MeterValuesOptions } from "../meterBarsModel";
import { MELEE_PULL, RANGED_PULL, type ThreatView } from "./threat.processor";

/** The rule behind the estimate, for the help tooltip (docs/threat-estimate.md has the full table). */
export const THREAT_RULE =
  "Estimated: classic logs carry no threat. Threat = (damage + ability bonus) × stance/form/buff modifiers " +
  "(Defensive Stance or Bear Form ×1.495, Battle/Berserker ×0.8, Rogue or Cat ×0.71, Righteous Fury ×1.9 on holy, " +
  "Salvation ×0.7, Tranquil Air ×0.8); heals give 0.5× split across engaged enemies; Taunt/Growl match the top threat; " +
  "Feign Death and Vanish drop to 0, Fade −820 for 10 s; a death resets. Max-rank talents assumed; unknown stances " +
  "read as tanking once the enemy has hit them. Tank = the enemy's latest melee target. Pulls at 110% (melee) / 130% (ranged) of the tank.";

const PULL_COLOR = "#ec1337";

/** "(estimated)" with the rule on hover (a native tooltip, so the landing's 3D chunk stays lean). */
export function ThreatEstimatedLabel() {
  return (
    <span title={THREAT_RULE} className="inline-flex cursor-help items-center gap-1 text-[10px] text-muted-foreground" data-threat-rule>
      (estimated)
      <Info className="h-3 w-3" aria-label={THREAT_RULE} />
    </span>
  );
}

/** The threat table in MeterBars' values mode: TANK tag, value + % of tank, 110% / 130% lines, PULLS tags. */
export function ThreatMeter({ view, limit, onOpen, openLabel }: { view: ThreatView; limit?: number; onOpen?: () => void; openLabel: string }) {
  const data: PlayerMetricChartData[] = view.rows.map((row) => ({
    playerID: row.guid,
    playerName: row.name,
    className: row.className,
    specialization: "",
    value: row.threat,
  }));
  const byGuid = new Map(view.rows.map((row) => [row.guid, row]));
  const top = view.rows.reduce((max, row) => Math.max(max, row.threat), 0);
  // 130% of the tank sits at 55% of the row, clear of the value columns.
  const scaleMax = Math.max(top, (view.tankThreat * RANGED_PULL) / 0.55);
  const values: MeterValuesOptions = {
    formatValue: (value) => formatNumber(value, 1),
    shareBase: view.tankThreat,
    formatShare: (share) => `${Math.round(share * 100)}%`,
    scaleMax,
    limit,
    pinFirst: (chartRow) => byGuid.get(chartRow.playerID)?.isTank === true,
    tagFor: (chartRow) => {
      const row = byGuid.get(chartRow.playerID);
      if (row?.isTank) return { label: "tank" };
      return row?.pulls ? { label: "pulls", color: PULL_COLOR } : undefined;
    },
    markers: view.tankThreat > 0
      ? [
          { value: view.tankThreat * MELEE_PULL, color: "#f0a8a8", label: "110% melee" },
          { value: view.tankThreat * RANGED_PULL, color: PULL_COLOR, label: "130% ranged" },
        ]
      : [],
  };
  return <MeterBars data={data} onOpen={onOpen} openLabel={openLabel} values={values} />;
}
