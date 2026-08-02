export type RelativeDurationContext = "total" | "component";

export function relativeDurationLabel(
  deltaMs: number,
  deltaPercent: number,
  requirementsComplete: boolean,
  context: RelativeDurationContext,
): string {
  if (deltaMs === 0) {
    if (context === "component") return "Same";
    return requirementsComplete ? "Same pace" : "Same duration";
  }

  if (requirementsComplete) {
    return `${deltaPercent}% ${deltaMs < 0 ? "faster" : "slower"}`;
  }

  if (context === "total") {
    return `${deltaPercent}% ${deltaMs < 0 ? "shorter" : "longer"}`;
  }

  return `${deltaPercent}% ${deltaMs < 0 ? "less time" : "more time"}`;
}
