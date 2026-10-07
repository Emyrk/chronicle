import {
  CUSTOM_PANEL_MAX_BREAKOUTS,
  type ChroniclePanelBreakoutHandleV1,
  type ChroniclePanelBreakoutOptionsV1,
  type ChroniclePanelBreakoutPositionV1,
  type ChroniclePanelBreakoutSizeV1,
} from "./pluginTypes";
import {
  normalizePluginBreakoutOptions,
  type PluginBreakoutViewport,
} from "./pluginBreakoutLogic";

export interface PluginBreakoutEntry {
  id: string;
  title: string;
  mount: HTMLElement;
  initialPosition: ChroniclePanelBreakoutPositionV1;
  initialSize: ChroniclePanelBreakoutSizeV1;
}

interface PluginBreakoutMount {
  mount: HTMLElement;
  root: ShadowRoot;
}

interface PluginBreakoutManagerOptions {
  panelId: string;
  getViewport: () => PluginBreakoutViewport;
  createMount: () => PluginBreakoutMount;
  onChange: (entries: PluginBreakoutEntry[]) => void;
}

export interface PluginBreakoutManager {
  open(options: ChroniclePanelBreakoutOptionsV1): ChroniclePanelBreakoutHandleV1;
  close(id: string): void;
  closeAll(): void;
  dispose(): void;
}

export function createPluginBreakoutManager({
  panelId,
  getViewport,
  createMount,
  onChange,
}: PluginBreakoutManagerOptions): PluginBreakoutManager {
  const entries = new Map<string, PluginBreakoutEntry>();
  let nextID = 1;
  let disposed = false;

  const publish = () => onChange([...entries.values()]);
  const close = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;
    entries.delete(id);
    entry.mount.remove();
    publish();
  };
  const closeAllEntries = (notify: boolean) => {
    if (entries.size === 0) return;
    for (const entry of entries.values()) entry.mount.remove();
    entries.clear();
    if (notify) publish();
  };
  const closeAll = () => closeAllEntries(true);

  return {
    open(options) {
      if (disposed) throw new Error("Custom panel is no longer mounted.");
      if (entries.size >= CUSTOM_PANEL_MAX_BREAKOUTS)
        throw new Error(`Custom panels may open at most ${CUSTOM_PANEL_MAX_BREAKOUTS} breakouts at once.`);

      const normalized = normalizePluginBreakoutOptions(
        options,
        getViewport(),
        entries.size,
      );
      const id = `${panelId}:breakout:${nextID++}`;
      const { mount, root } = createMount();
      entries.set(id, { id, mount, ...normalized });
      publish();
      return { id, root, close: () => close(id) };
    },
    close,
    closeAll,
    dispose() {
      if (disposed) return;
      disposed = true;
      closeAllEntries(false);
    },
  };
}
