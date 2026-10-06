import type { ChroniclePanelPluginV1 } from "./pluginTypes";

const moduleCache = new Map<string, Promise<ChroniclePanelPluginV1>>();

export function loadCustomPanelModule(url: string): Promise<ChroniclePanelPluginV1> {
  let promise = moduleCache.get(url);
  if (!promise) {
    promise = import(/* @vite-ignore */ url).then((module: { default?: unknown }) => {
      const plugin = module.default as Partial<ChroniclePanelPluginV1> | undefined;
      if (!plugin || plugin.apiVersion !== 1 || typeof plugin.mount !== "function") throw new Error("Plugin default export does not implement ChroniclePanelPluginV1.");
      return plugin as ChroniclePanelPluginV1;
    });
    moduleCache.set(url, promise);
    promise.catch(() => moduleCache.delete(url));
  }
  return promise;
}

export function clearCustomPanelModuleCache(): void { moduleCache.clear(); }
