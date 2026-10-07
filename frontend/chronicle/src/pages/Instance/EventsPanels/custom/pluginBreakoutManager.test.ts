import { describe, expect, it, vi } from "vitest";
import { CUSTOM_PANEL_MAX_BREAKOUTS } from "./pluginTypes";
import {
  createPluginBreakoutManager,
  type PluginBreakoutEntry,
} from "./pluginBreakoutManager";

function createHarness() {
  const published: PluginBreakoutEntry[][] = [];
  const mounts: Array<{ remove: ReturnType<typeof vi.fn> }> = [];
  const roots: ShadowRoot[] = [];
  const manager = createPluginBreakoutManager({
    panelId: "panel-1",
    getViewport: () => ({ width: 1_000, height: 800 }),
    createMount: () => {
      const mount = { remove: vi.fn() };
      const root = {} as ShadowRoot;
      mounts.push(mount);
      roots.push(root);
      return { mount: mount as unknown as HTMLElement, root };
    },
    onChange: (entries) => published.push(entries),
  });
  return { manager, mounts, published, roots };
}

describe("plugin breakout manager", () => {
  it("publishes opened breakouts and closes handles idempotently", () => {
    const { manager, mounts, published, roots } = createHarness();
    const handle = manager.open({ title: " Details " });

    expect(handle.id).toBe("panel-1:breakout:1");
    expect(handle.root).toBe(roots[0]);
    expect(published.at(-1)).toMatchObject([{
      id: handle.id,
      title: "Details",
      initialPosition: { x: 8, y: 8 },
      initialSize: { width: 420, height: 320 },
    }]);

    handle.close();
    handle.close();
    expect(mounts[0].remove).toHaveBeenCalledOnce();
    expect(published.at(-1)).toEqual([]);
  });

  it("enforces the per-panel limit and allows another breakout after closing", () => {
    const { manager } = createHarness();
    const handles = Array.from({ length: CUSTOM_PANEL_MAX_BREAKOUTS }, (_, index) =>
      manager.open({ title: `Breakout ${index + 1}` }));

    expect(() => manager.open({ title: "Too many" })).toThrow("at most 8 breakouts");
    handles[0].close();
    expect(() => manager.open({ title: "Replacement" })).not.toThrow();
  });

  it("closes all breakouts and rejects opens after disposal", () => {
    const { manager, mounts, published } = createHarness();
    manager.open({ title: "One" });
    manager.open({ title: "Two" });

    manager.closeAll();
    manager.closeAll();
    expect(mounts.every((mount) => mount.remove.mock.calls.length === 1)).toBe(true);
    expect(published.at(-1)).toEqual([]);

    manager.open({ title: "Three" });
    const publicationsBeforeDispose = published.length;
    manager.dispose();
    manager.dispose();
    expect(published).toHaveLength(publicationsBeforeDispose);
    expect(mounts[2].remove).toHaveBeenCalledOnce();
    expect(() => manager.open({ title: "After dispose" })).toThrow("no longer mounted");
  });
});
