import type {
  ChroniclePanelBreakoutOptionsV1,
  ChroniclePanelBreakoutPositionV1,
  ChroniclePanelBreakoutSizeV1,
} from "./pluginTypes";
import { CUSTOM_PANEL_BREAKOUT_TITLE_MAX_LENGTH } from "./pluginTypes";

export const DEFAULT_PLUGIN_BREAKOUT_SIZE: ChroniclePanelBreakoutSizeV1 = {
  width: 420,
  height: 320,
};
export const MIN_PLUGIN_BREAKOUT_WIDTH = 260;
export const MIN_PLUGIN_BREAKOUT_HEIGHT = 180;
const VIEWPORT_MARGIN = 8;
const VISIBLE_HEADER_WIDTH = 120;
const VISIBLE_HEADER_HEIGHT = 40;

export interface PluginBreakoutViewport {
  width: number;
  height: number;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizePluginBreakoutTitle(title: string): string {
  const normalized = title.trim();
  if (!normalized) throw new Error("Custom panel breakout title is required.");
  if (normalized.length > CUSTOM_PANEL_BREAKOUT_TITLE_MAX_LENGTH)
    throw new Error(`Custom panel breakout title exceeds ${CUSTOM_PANEL_BREAKOUT_TITLE_MAX_LENGTH} characters.`);
  return normalized;
}

export function clampPluginBreakoutSize(
  requested: ChroniclePanelBreakoutSizeV1 | undefined,
  viewport: PluginBreakoutViewport,
): ChroniclePanelBreakoutSizeV1 {
  const maximumWidth = Math.max(MIN_PLUGIN_BREAKOUT_WIDTH, viewport.width - VIEWPORT_MARGIN * 2);
  const maximumHeight = Math.max(MIN_PLUGIN_BREAKOUT_HEIGHT, viewport.height - VIEWPORT_MARGIN * 2);
  return {
    width: Math.min(maximumWidth, Math.max(
      MIN_PLUGIN_BREAKOUT_WIDTH,
      Math.round(finiteOr(requested?.width, DEFAULT_PLUGIN_BREAKOUT_SIZE.width)),
    )),
    height: Math.min(maximumHeight, Math.max(
      MIN_PLUGIN_BREAKOUT_HEIGHT,
      Math.round(finiteOr(requested?.height, DEFAULT_PLUGIN_BREAKOUT_SIZE.height)),
    )),
  };
}

export function clampPluginBreakoutPosition(
  requested: ChroniclePanelBreakoutPositionV1,
  size: ChroniclePanelBreakoutSizeV1,
  viewport: PluginBreakoutViewport,
): ChroniclePanelBreakoutPositionV1 {
  const visibleWidth = Math.min(size.width, VISIBLE_HEADER_WIDTH);
  const visibleHeight = Math.min(size.height, VISIBLE_HEADER_HEIGHT);
  const minX = Math.min(VIEWPORT_MARGIN, viewport.width - visibleWidth);
  const maxX = Math.max(minX, viewport.width - visibleWidth);
  const minY = VIEWPORT_MARGIN;
  const maxY = Math.max(minY, viewport.height - visibleHeight);
  return {
    x: Math.min(maxX, Math.max(minX, Math.round(finiteOr(requested.x, VIEWPORT_MARGIN)))),
    y: Math.min(maxY, Math.max(minY, Math.round(finiteOr(requested.y, VIEWPORT_MARGIN)))),
  };
}

export function normalizePluginBreakoutOptions(
  options: ChroniclePanelBreakoutOptionsV1,
  viewport: PluginBreakoutViewport,
  index: number,
): Required<ChroniclePanelBreakoutOptionsV1> {
  const initialSize = clampPluginBreakoutSize(options.initialSize, viewport);
  const fallbackPosition = {
    x: VIEWPORT_MARGIN + 24 * index,
    y: VIEWPORT_MARGIN + 24 * index,
  };
  return {
    title: normalizePluginBreakoutTitle(options.title),
    initialPosition: clampPluginBreakoutPosition(options.initialPosition ?? fallbackPosition, initialSize, viewport),
    initialSize,
  };
}
