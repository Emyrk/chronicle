export type StatusWindowPresetId = "tight" | "compact" | "standard" | "extended";

export interface StatusWindowPreset {
  id: StatusWindowPresetId;
  historyMilli: number;
  futureMilli: number;
  label: string;
}

export const STATUS_WINDOW_PRESETS: StatusWindowPreset[] = [
  { id: "tight", historyMilli: 2_000, futureMilli: 8_000, label: "−2s to +8s" },
  { id: "compact", historyMilli: 5_000, futureMilli: 20_000, label: "−5s to +20s" },
  { id: "standard", historyMilli: 10_000, futureMilli: 40_000, label: "−10s to +40s" },
  { id: "extended", historyMilli: 15_000, futureMilli: 60_000, label: "−15s to +60s" },
];

export const DEFAULT_STATUS_WINDOW = STATUS_WINDOW_PRESETS[2];
export const STATUS_WINDOW_PREFIX = "w:";

export function parseStatusWindow(option: string | null | undefined): StatusWindowPreset {
  const token = option?.split(",").find((value) => value.startsWith(STATUS_WINDOW_PREFIX));
  const id = token?.slice(STATUS_WINDOW_PREFIX.length);
  return STATUS_WINDOW_PRESETS.find((preset) => preset.id === id) ?? DEFAULT_STATUS_WINDOW;
}

export function updateStatusWindow(
  option: string | null | undefined,
  presetId: StatusWindowPresetId,
): string | null {
  const normalizedTokens = option?.split(",").filter(
    (value) => value && !value.startsWith(STATUS_WINDOW_PREFIX),
  ) ?? [];
  if (presetId !== DEFAULT_STATUS_WINDOW.id) {
    normalizedTokens.push(`${STATUS_WINDOW_PREFIX}${presetId}`);
  }
  return normalizedTokens.length > 0 ? normalizedTokens.join(",") : null;
}
