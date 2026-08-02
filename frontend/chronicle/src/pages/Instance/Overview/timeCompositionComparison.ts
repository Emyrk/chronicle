export type RelativeDurationContext = "total" | "component";

export function relativeDurationLabel(
  deltaMs: number,
  deltaPercent: number,
  requirementsComplete: boolean,
  context: RelativeDurationContext,
): string {
  if (!requirementsComplete) {
    if (context === "total") return "Partial raid";
    if (deltaMs === 0) return "Same time";
    return deltaMs < 0 ? "Less time" : "More time";
  }

  if (deltaMs === 0) {
    return context === "total" ? "Same pace" : "Same";
  }

  return `${deltaPercent}% ${deltaMs < 0 ? "faster" : "slower"}`;
}
