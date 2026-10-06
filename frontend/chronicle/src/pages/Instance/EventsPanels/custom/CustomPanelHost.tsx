import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useInstanceEventsContext, type StreamType } from "@/hooks/instanceEvents";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import type { PanelContext } from "../types";
import { createPluginItemMetadataBroker } from "./pluginGameData";
import { copyPluginStream } from "./pluginStreamBroker";
import { loadCustomPanelModule } from "./pluginModuleLoader";
import { CUSTOM_PANEL_OPTION_MAX_LENGTH, type ChroniclePanelHostAPIV1, type ChroniclePanelInstanceV1, type ChroniclePanelSnapshotV1, type CustomPanelInstallationV1, type ChroniclePanelManifestPanelV1 } from "./pluginTypes";

const BASE_CSS = `:host{display:block;width:100%;height:100%;color:var(--chronicle-foreground);font-family:system-ui,sans-serif}*,*:before,*:after{box-sizing:border-box}`;

export interface CustomPanelHostProps {
  installation: CustomPanelInstallationV1;
  panel: ChroniclePanelManifestPanelV1;
  context: PanelContext;
  panelId: string;
  panelOption?: string | null;
  onPanelOptionChange?: (option: string | null) => void;
  onError: (error: Error) => void;
}

export function CustomPanelHost({ installation, panel, context, panelId, panelOption, onPanelOptionChange, onError }: CustomPanelHostProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ChroniclePanelInstanceV1 | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const updateFrameRef = useRef<number | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { fetchStream } = useInstanceEventsContext();
  const sync = useSyncModeContextOptional();
  const { resolvedTheme } = useTheme();

  const snapshot = useMemo<ChroniclePanelSnapshotV1>(() => ({
    instance: {
      id: context.instance.id,
      title: context.instance.name,
      startTime: context.instance.startTime,
      endTime: context.instance.endTime ?? context.instance.startTime,
      capabilities: [...(context.instance.capabilities ?? [])],
      encounters: context.instance.encounters,
      players: context.instance.players ?? {},
      units: context.instance.units ?? {},
    },
    selection: {
      encounterIds: [...context.selectedEncounterIds],
      playerIds: [...context.entitySelection.playerIds],
      enemyIds: [...context.entitySelection.enemyIds],
    },
    sync: { enabled: sync?.enabled === true, playing: sync?.isPlaying === true, timestampMs: sync?.currentTimestamp?.getTime() ?? null },
    panel: {
      panelInstanceId: panelId,
      option: panelOption ?? null,
      width: size.width,
      height: size.height,
      renderMode: context.renderMode ?? "default",
      poppedOut: hostRef.current?.ownerDocument !== document,
    },
    theme: { mode: resolvedTheme === "dark" ? "dark" : "light" },
  }), [context, panelId, panelOption, resolvedTheme, size, sync?.currentTimestamp, sync?.enabled, sync?.isPlaying]);

  const latestSnapshotRef = useRef(snapshot);
  latestSnapshotRef.current = snapshot;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    const abort = new AbortController();
    abortRef.current = abort;
    let disposed = false;
    const ownerWindow = host.ownerDocument.defaultView ?? window;
    const style = host.ownerDocument.createElement("style");
    style.textContent = BASE_CSS;
    root.replaceChildren(style);
    host.style.setProperty("--chronicle-background", "hsl(var(--background))");
    host.style.setProperty("--chronicle-foreground", "hsl(var(--foreground))");
    host.style.setProperty("--chronicle-muted", "hsl(var(--muted))");
    host.style.setProperty("--chronicle-border", "hsl(var(--border))");

    const getItemMetadata = createPluginItemMetadataBroker(abort.signal);
    const api: ChroniclePanelHostAPIV1 = {
      events: { getStream: (type: StreamType) => copyPluginStream(type, panel.streams, fetchStream, abort.signal) },
      gameData: { getItemMetadata },
      workers: { create: () => {
        if (!installation.artifacts.worker) throw new Error("This plugin did not declare a worker artifact.");
        if (workerRef.current) throw new Error("Only one host-managed worker is allowed per custom panel.");
        const worker = new Worker(installation.artifacts.worker.url, { type: "module", name: `chronicle-plugin:${installation.repository}:${panel.id}` });
        worker.addEventListener("error", (event) => onError(new Error(event.message || "Plugin worker failed")), { once: true });
        workerRef.current = worker;
        return worker;
      } },
      panel: {
        setOption: (option) => {
          if (option && option.length > CUSTOM_PANEL_OPTION_MAX_LENGTH) throw new Error("Custom panel option exceeds 2 KiB.");
          onPanelOptionChange?.(option);
        },
        selectEncounters: (ids) => context.onSelectEncounters?.(ids),
        togglePlayer: (id) => context.onTogglePlayer?.(id),
        togglePlayers: (ids) => context.onTogglePlayers?.(ids),
      },
      lifecycle: { signal: abort.signal },
    };

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(host);

    void (async () => {
      try {
        if (installation.artifacts.styles) {
          const response = await fetch(installation.artifacts.styles.url, { signal: abort.signal });
          if (!response.ok) throw new Error(`Plugin stylesheet failed (${response.status})`);
          const pluginStyle = host.ownerDocument.createElement("style");
          pluginStyle.textContent = await response.text();
          root.append(pluginStyle);
        }
        const plugin = await loadCustomPanelModule(installation.artifacts.entry.url);
        if (disposed) return;
        const mounted = await plugin.mount({ panelId: panel.id, root, api, snapshot: latestSnapshotRef.current });
        if (disposed) { await mounted.destroy?.(); return; }
        instanceRef.current = mounted;
        mountedRef.current = true;
      } catch (error) {
        if (!abort.signal.aborted) onError(error instanceof Error ? error : new Error(String(error)));
      }
    })();

    return () => {
      disposed = true;
      mountedRef.current = false;
      abort.abort();
      observer.disconnect();
      if (updateFrameRef.current !== null) ownerWindow.cancelAnimationFrame(updateFrameRef.current);
      workerRef.current?.terminate();
      workerRef.current = null;
      const mounted = instanceRef.current;
      instanceRef.current = null;
      root.replaceChildren();
      Promise.resolve().then(() => mounted?.destroy?.()).catch((error) => console.error("Custom panel destroy failed", error));
    };
  // Only lifecycle capabilities remount the plugin. Selection and sync data flow through update().
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchStream, installation, onError, panel.id, panel.streams, context.onSelectEncounters, context.onTogglePlayer, context.onTogglePlayers, onPanelOptionChange]);

  useEffect(() => {
    if (!mountedRef.current || !instanceRef.current?.update) return;
    const ownerWindow = hostRef.current?.ownerDocument.defaultView ?? window;
    if (updateFrameRef.current !== null) ownerWindow.cancelAnimationFrame(updateFrameRef.current);
    updateFrameRef.current = ownerWindow.requestAnimationFrame(() => {
      updateFrameRef.current = null;
      Promise.resolve()
        .then(() => instanceRef.current?.update?.(latestSnapshotRef.current))
        .catch((error) => onError(error instanceof Error ? error : new Error(String(error))));
    });
    return () => { if (updateFrameRef.current !== null) ownerWindow.cancelAnimationFrame(updateFrameRef.current); };
  }, [snapshot, onError]);

  return <div ref={hostRef} className="h-full w-full overflow-auto styled-scrollbar" />;
}
