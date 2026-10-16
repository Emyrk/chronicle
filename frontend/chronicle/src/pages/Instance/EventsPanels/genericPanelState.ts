export function shouldShowInitialPanelState(
  active: boolean,
  totalEvents: number,
  processingTimeMs: number | null,
): boolean {
  return active && totalEvents === 0 && processingTimeMs === null;
}
