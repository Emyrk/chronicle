export function shouldPlaceEffectiveHealingBeforeOverheal(
  effectiveHealing: boolean,
  pinned: boolean,
  isMobile: boolean,
): boolean {
  return effectiveHealing && pinned && isMobile;
}
