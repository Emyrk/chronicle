import type { PanelDefinition } from "./types";

export function shouldLoadPublicRankingData(unlisted: boolean | undefined): boolean {
  return !unlisted;
}

export function hasRequiredPanelCapabilities(
  panel: Pick<PanelDefinition<unknown>, "requiredCapabilities">,
  capabilities: readonly string[],
): boolean {
  return (panel.requiredCapabilities ?? []).every((capability) =>
    capabilities.includes(capability),
  );
}

export function hasRequiredPanelFlavors(
  panel: Pick<PanelDefinition<unknown>, "requiredFlavors">,
  flavors: readonly string[],
): boolean {
  return (panel.requiredFlavors ?? []).every((flavor) => flavors.includes(flavor));
}
