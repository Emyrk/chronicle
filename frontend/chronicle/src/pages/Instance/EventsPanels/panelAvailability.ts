import type { PanelDefinition } from "./types";

export function hasRequiredPanelCapabilities(
  panel: Pick<PanelDefinition<unknown>, "requiredCapabilities">,
  capabilities: readonly string[],
): boolean {
  return (panel.requiredCapabilities ?? []).every((capability) =>
    capabilities.includes(capability),
  );
}
