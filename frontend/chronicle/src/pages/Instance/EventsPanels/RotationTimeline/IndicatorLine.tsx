/**
 * The shared yellow time indicator. One per section (overview, lanes, auras),
 * all positioned from view.indicatorMs so they always line up.
 */
export function IndicatorLine({ leftPct }: { leftPct: number }) {
  if (leftPct < 0 || leftPct > 100) return null;
  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-school-holy shadow-[0_0_6px_var(--color-school-holy)]"
      style={{ left: `${leftPct}%` }}
    />
  );
}
