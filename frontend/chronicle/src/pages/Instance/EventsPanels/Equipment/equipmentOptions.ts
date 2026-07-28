export type EquipmentSubTab = "gear" | "talents";

export interface EquipmentPanelOption {
  playerGuid: string | null;
  subTab: EquipmentSubTab | null;
}

export function parseEquipmentPanelOption(option: string | null | undefined): EquipmentPanelOption {
  const tokens = (option ?? "").split(",").map((token) => token.trim()).filter(Boolean);
  const playerToken = tokens.find((token) => token.startsWith("p:"));
  const tabToken = tokens.find((token) => token.startsWith("t:"));
  const rawTab = tabToken?.slice(2);

  return {
    playerGuid: playerToken?.slice(2) || null,
    subTab: rawTab === "gear" || rawTab === "talents" ? rawTab : null,
  };
}

export function serializeEquipmentPanelOption(
  playerGuid: string | null,
  subTab: EquipmentSubTab,
): string | null {
  const tokens: string[] = [];
  if (playerGuid) tokens.push(`p:${playerGuid}`);
  if (subTab !== "gear") tokens.push(`t:${subTab}`);
  return tokens.length > 0 ? tokens.join(",") : null;
}
