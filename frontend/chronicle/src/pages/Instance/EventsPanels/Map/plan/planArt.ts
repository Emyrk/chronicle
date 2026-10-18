import { drawSkull } from "../unitTokenArt";
import type { PlanMarkerIcon } from "./mapPlan";

/**
 * The plan layer's 2D art (no three.js), shared by the 3D map (as sprite
 * textures) and its toolbar and legend: WoW's eight raid target markers.
 */

export const PLAN_ART_SIZE = 64;

export const MARKER_COLORS: Record<PlanMarkerIcon, string> = {
  star: "#facc15",
  circle: "#f97316",
  diamond: "#c026d3",
  triangle: "#22c55e",
  moon: "#cbd5e1",
  square: "#3b82f6",
  cross: "#ef4444",
  skull: "#f5f5f4",
};

export const MARKER_NAMES: Record<PlanMarkerIcon, string> = {
  star: "Star",
  circle: "Circle",
  diamond: "Diamond",
  triangle: "Triangle",
  moon: "Moon",
  square: "Square",
  cross: "Cross",
  skull: "Skull",
};

/** One raid target marker, filling a PLAN_ART_SIZE square with a dark outline. */
export function drawPlanMarker(context: CanvasRenderingContext2D, icon: PlanMarkerIcon) {
  const size = PLAN_ART_SIZE;
  const half = size / 2;
  const r = half - 6;
  context.save();
  context.clearRect(0, 0, size, size);
  context.lineJoin = "round";
  context.lineWidth = 4;
  context.strokeStyle = "rgba(0,0,0,.85)";
  context.fillStyle = MARKER_COLORS[icon];
  context.shadowColor = "rgba(0,0,0,.6)";
  context.shadowBlur = 4;
  context.beginPath();
  switch (icon) {
    case "star":
      for (let index = 0; index < 10; index++) {
        const angle = -Math.PI / 2 + (index * Math.PI) / 5;
        const radius = index % 2 === 0 ? r : r * 0.45;
        context.lineTo(half + Math.cos(angle) * radius, half + Math.sin(angle) * radius);
      }
      context.closePath();
      break;
    case "circle":
      context.arc(half, half, r * 0.85, 0, Math.PI * 2);
      break;
    case "diamond":
      context.moveTo(half, half - r);
      context.lineTo(half + r * 0.7, half);
      context.lineTo(half, half + r);
      context.lineTo(half - r * 0.7, half);
      context.closePath();
      break;
    case "triangle":
      context.moveTo(half, half - r);
      context.lineTo(half + r * 0.92, half + r * 0.72);
      context.lineTo(half - r * 0.92, half + r * 0.72);
      context.closePath();
      break;
    case "moon":
      context.arc(half, half, r * 0.85, Math.PI * 0.3, Math.PI * 1.7, false);
      context.arc(half + r * 0.38, half - r * 0.05, r * 0.62, Math.PI * 1.45, Math.PI * 0.55, true);
      context.closePath();
      break;
    case "square":
      context.rect(half - r * 0.72, half - r * 0.72, r * 1.44, r * 1.44);
      break;
    case "cross": {
      const arm = r * 0.3;
      context.translate(half, half);
      context.rotate(Math.PI / 4);
      context.rect(-r, -arm, r * 2, arm * 2);
      context.rect(-arm, -r, arm * 2, r * 2);
      context.setTransform(1, 0, 0, 1, 0, 0);
      break;
    }
    case "skull":
      context.arc(half, half, r * 0.95, 0, Math.PI * 2);
      context.fillStyle = "#1c1917";
      break;
  }
  context.stroke();
  context.fill();
  if (icon === "skull") drawSkull(context, half, r * 1.5);
  context.restore();
}
