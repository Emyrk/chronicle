export type RelativeDurationContext = "total" | "component";

export function relativeDurationLabel(
  deltaMs: number,
  deltaPercent: number,
  context: RelativeDurationContext,
): string {
  if (deltaMs === 0) {
    return context === "total" ? "Same pace" : "Same";
  }

  return `${deltaPercent}% ${deltaMs < 0 ? "faster" : "slower"}`;
}
