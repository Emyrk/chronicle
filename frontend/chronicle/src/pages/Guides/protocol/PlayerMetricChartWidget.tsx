import { PlayerMetricChart, type ChartType, type PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import type { SceneNode } from "./types";

function rows(value: unknown): PlayerMetricChartData[] {
  if (!Array.isArray(value)) return [];
  return (value as Array<Omit<PlayerMetricChartData, "specialization"> & { specialization?: string }>).map((row) => ({
    ...row,
    specialization: row.specialization ?? "",
  }));
}

function chartType(value: unknown): ChartType {
  return value === "healing" || value === "taken" || value === "mitigation" ? value : "damage";
}

const optionalText = (value: unknown) => typeof value === "string" ? value : undefined;
const optionalNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;

/** Chronicle's real player meter, configured by a Lua PlayerMetricChart. */
export function PlayerMetricChartWidget({ node }: { node: SceneNode }) {
  const props = node.props;
  return (
    <PlayerMetricChart
      className="h-full"
      data={rows(props.data)}
      type={chartType(props.type)}
      perSecond={props.perSecond === true}
      duration_millis={optionalNumber(props.durationMillis)}
      panelTitle={optionalText(props.panelTitle)}
      stackedLabel={optionalText(props.stackedLabel)}
      valueSuffix={optionalText(props.valueSuffix)}
      hideZeroValue={props.hideZeroValue === true}
      rowHeight={optionalNumber(props.rowHeight)}
      disableInteractions
      animateValues={false}
    />
  );
}
