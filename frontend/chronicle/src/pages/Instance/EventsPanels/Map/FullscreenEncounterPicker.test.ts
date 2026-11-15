import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Encounter } from "../../InstancePage";

// Replay is the page's analytics mode: a pick must never reach it.
const sync = vi.hoisted(() => ({ enable: vi.fn(), play: vi.fn(), setTimestamp: vi.fn() }));
vi.mock("../../SyncModeContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../SyncModeContext")>()),
  useSyncModeContextOptional: () => sync,
  useSyncModeContext: () => sync,
}));

const { FullscreenEncounterPicker } = await import("./Map");

function buttons(node: ReactNode): ReactElement<{ onClick: () => void; title: string }>[] {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  if (node.type === "button") return [node as ReactElement<{ onClick: () => void; title: string }>];
  return buttons(node.props.children);
}

function encounter(id: string, name: string): Encounter {
  return { id, name, boss: true, start_time: "2026-11-01T20:00:00Z" } as Encounter;
}

describe("FullscreenEncounterPicker", () => {
  it("picking an encounter selects it, as the encounter list does, without turning on Replay", () => {
    const onSelect = vi.fn();
    const picker = FullscreenEncounterPicker({
      encounters: [encounter("e1", "Lucifron"), encounter("e2", "Magmadar")],
      selectedIds: ["e1", "e2"],
      onSelect,
    });
    const magmadar = buttons(picker).find((button) => button.props.title === "Magmadar");
    magmadar?.props.onClick();
    expect(onSelect).toHaveBeenCalledWith(["e2"]);
    expect(sync.enable).not.toHaveBeenCalled();
    expect(sync.play).not.toHaveBeenCalled();
    expect(sync.setTimestamp).not.toHaveBeenCalled();
  });
});
