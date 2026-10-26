const FOCUS_PREFIX = "f:";
const NO_RANKS_TOKEN = "noranks";
/** Show the meter as bars only: names, no columns, a click opens the full preset (the Watch preset). */
export const METER_BARS_PANEL_OPTION = "bars";
const MAX_OPTION_LENGTH = 4096;
const MAX_TOKEN_LENGTH = 1024;

export interface MetricPanelLiveState {
  focusedEntityId: string | null;
  showRanks: boolean;
}

function parseTokens(option: string | null | undefined): string[] {
  if (!option || option.length > MAX_OPTION_LENGTH) return [];
  return option
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && token.length <= MAX_TOKEN_LENGTH);
}

export function parseMetricPanelLiveState(option: string | null | undefined): MetricPanelLiveState {
  const tokens = parseTokens(option);
  const focusToken = tokens.find((token) => token.startsWith(FOCUS_PREFIX));
  const focusedEntityId = focusToken?.slice(FOCUS_PREFIX.length) || null;
  return {
    focusedEntityId,
    showRanks: !tokens.includes(NO_RANKS_TOKEN),
  };
}

export function isMeterBarsOption(option: string | null | undefined): boolean {
  return parseTokens(option).includes(METER_BARS_PANEL_OPTION);
}

export function updateMetricPanelLiveState(
  option: string | null | undefined,
  patch: Partial<MetricPanelLiveState>,
): string | null {
  let tokens = parseTokens(option);
  if ("focusedEntityId" in patch) {
    tokens = tokens.filter((token) => !token.startsWith(FOCUS_PREFIX));
    if (patch.focusedEntityId) tokens.push(`${FOCUS_PREFIX}${patch.focusedEntityId}`);
  }
  if ("showRanks" in patch) {
    tokens = tokens.filter((token) => token !== NO_RANKS_TOKEN);
    if (patch.showRanks === false) tokens.push(NO_RANKS_TOKEN);
  }
  return tokens.length > 0 ? tokens.join(",") : null;
}
