import { useId, type CSSProperties, type ReactNode } from "react";
import { iconUrl } from "@/config/iconUrl";
import { useIconBaseUrl } from "@/hooks/useDatasetId";
import type { CanvasShape } from "../widgets/canvas";
import { arcPath, piePath } from "./canvasGeometry";
import type { SceneNode } from "./types";

const TAU = Math.PI * 2;

const num = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const str = (value: unknown) => (typeof value === "string" ? value : undefined);

/** Opacity and glow shared by every shape. */
function look(shape: CanvasShape, glowColor: string | undefined): CSSProperties | undefined {
  const glow = num(shape.glow);
  const alpha = shape.alpha === undefined ? undefined : num(shape.alpha, 1);
  if (!glow && alpha === undefined) return undefined;
  return {
    opacity: alpha,
    filter: glow && glowColor ? `drop-shadow(0 0 ${glow / 2}px ${glowColor}) drop-shadow(0 0 ${glow}px ${glowColor})` : undefined,
  };
}

function renderShape(shape: CanvasShape, key: number, clipPrefix: string, iconBase: string | undefined): ReactNode {
  const x = num(shape.x), y = num(shape.y), r = num(shape.r);
  const cap = shape.cap === "round" ? "round" : "butt";
  switch (shape.kind) {
    case "circle": {
      const fill = str(shape.fill), stroke = str(shape.stroke);
      return (
        <circle key={key} cx={x} cy={y} r={r} fill={fill ?? "none"} stroke={stroke} strokeWidth={stroke ? num(shape.width, 1) : undefined}
          style={look(shape, stroke ?? fill)} />
      );
    }
    case "arc": {
      const color = str(shape.color), from = num(shape.from), to = num(shape.to);
      const style = look(shape, color);
      if (Math.abs(to - from) >= TAU) return <circle key={key} cx={x} cy={y} r={r} fill="none" stroke={color} strokeWidth={num(shape.width)} style={style} />;
      return <path key={key} d={arcPath(x, y, r, from, to)} fill="none" stroke={color} strokeWidth={num(shape.width)} strokeLinecap={cap} style={style} />;
    }
    case "pie": {
      const color = str(shape.color), track = str(shape.track);
      const value = Math.min(1, Math.max(0, num(shape.value)));
      const start = shape.start === undefined ? -Math.PI / 2 : num(shape.start);
      return (
        <g key={key} style={look(shape, color)}>
          {track && <circle cx={x} cy={y} r={r} fill={track} />}
          {value >= 1 ? <circle cx={x} cy={y} r={r} fill={color} /> : value > 0 && <path d={piePath(x, y, r, value, start)} fill={color} />}
        </g>
      );
    }
    case "line": {
      const color = str(shape.color), dash = num(shape.dash);
      return (
        <line key={key} x1={num(shape.x1)} y1={num(shape.y1)} x2={num(shape.x2)} y2={num(shape.y2)} stroke={color} strokeWidth={num(shape.width)} strokeLinecap={cap}
          strokeDasharray={dash > 0 ? `${dash} ${num(shape.gap, dash)}` : undefined} strokeDashoffset={dash > 0 ? num(shape.offset) : undefined}
          style={look(shape, color)} />
      );
    }
    case "text": {
      const color = str(shape.color) ?? "#ffffff";
      const anchor = shape.align === "center" ? "middle" : shape.align === "right" ? "end" : "start";
      return (
        <text key={key} x={x} y={y} fill={color} fontSize={num(shape.size, 14)} textAnchor={anchor} dominantBaseline="central" style={look(shape, color)}>
          {str(shape.text)}
        </text>
      );
    }
    case "icon": {
      const clipId = `${clipPrefix}-${key}`;
      return (
        <g key={key} style={look(shape, "#ffffff")}>
          <clipPath id={clipId}><circle cx={x} cy={y} r={r} /></clipPath>
          <image href={iconUrl(str(shape.icon) ?? "", iconBase)} x={x - r} y={y - r} width={2 * r} height={2 * r} clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" />
        </g>
      );
    }
    default:
      return null;
  }
}

/**
 * A Lua Canvas: its shapes drawn as one SVG in the node's own pixel space (origin top-left, y down).
 * Shapes outside the canvas are not clipped, so a radar's labels may overhang its edges.
 */
export function LuaCanvas({ node }: { node: SceneNode }) {
  const iconBase = useIconBaseUrl();
  const clipPrefix = `lua-canvas-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const width = num(node.props.width, 400), height = num(node.props.height, 400);
  const shapes = Array.isArray(node.props.shapes) ? (node.props.shapes as CanvasShape[]) : [];
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible", display: "block" }} aria-hidden>
      {shapes.map((shape, index) => renderShape(shape, index, clipPrefix, iconBase))}
    </svg>
  );
}
