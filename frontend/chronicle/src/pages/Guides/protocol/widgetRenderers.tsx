import type { ComponentType, CSSProperties } from "react";
import type { WidgetKind } from "../widgets";
import { LuaLineChart } from "./LuaLineChart";
import { PlayerMetricChartWidget } from "./PlayerMetricChartWidget";
import type { SceneNode } from "./types";

export interface WidgetRendererProps {
  node: SceneNode;
}

interface WidgetRenderer {
  component: ComponentType<WidgetRendererProps>;
  /** Whether the widget handles the pointer itself (hover readouts, legends). */
  interactive: boolean;
}

/**
 * React renderers for widget kinds, keyed by WidgetKind so a widget spec without a renderer fails
 * to compile. Renderers read the node's validated props; see ../widgets for what each prop holds.
 */
export const WIDGET_RENDERERS: { readonly [K in WidgetKind]: WidgetRenderer } = {
  "player-metric-chart": { component: PlayerMetricChartWidget, interactive: false },
  "line-chart": { component: LuaLineChart, interactive: true },
};

export function renderWidget(kind: WidgetKind, node: SceneNode, style: CSSProperties) {
  const { component: Widget, interactive } = WIDGET_RENDERERS[kind];
  return (
    <div key={node.id} data-guide-node={node.id} style={interactive ? { ...style, pointerEvents: "auto" } : style}>
      <Widget node={node} />
    </div>
  );
}
