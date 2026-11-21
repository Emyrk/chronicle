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
  /** Adjusts the positioned wrapper, e.g. to fill the parent instead of using SetPoint/SetSize. */
  layout?: (node: SceneNode, style: CSSProperties) => CSSProperties;
}

const fillParent = (node: SceneNode, style: CSSProperties): CSSProperties =>
  node.props.fillParent === true ? { ...style, left: 0, top: 0, width: "100%", height: "100%", transform: undefined } : style;

/**
 * React renderers for widget kinds, keyed by WidgetKind so a widget spec without a renderer fails
 * to compile. Renderers read the node's validated props; see ../widgets for what each prop holds.
 */
export const WIDGET_RENDERERS: { readonly [K in WidgetKind]: WidgetRenderer } = {
  "player-metric-chart": { component: PlayerMetricChartWidget, interactive: false },
  "line-chart": { component: LuaLineChart, interactive: true, layout: fillParent },
};

export function renderWidget(kind: WidgetKind, node: SceneNode, style: CSSProperties) {
  const renderer: WidgetRenderer = WIDGET_RENDERERS[kind];
  const { component: Widget, interactive, layout } = renderer;
  const positioned = layout ? layout(node, style) : style;
  return (
    <div key={node.id} data-guide-node={node.id} style={interactive ? { ...positioned, pointerEvents: "auto" } : positioned}>
      <Widget node={node} />
    </div>
  );
}
