export const ACTION_BAR_AD_SUPPRESSION_ATTRIBUTE = "data-layout-action-bar-open"

export function shouldSuppressMobileAdForActionBar({
  isMobile,
  isEncounterView,
  actionBarOpen,
  suppressActionBar,
}: {
  isMobile: boolean
  isEncounterView: boolean
  actionBarOpen: boolean
  suppressActionBar?: boolean
}) {
  return isMobile && isEncounterView && actionBarOpen && !suppressActionBar
}

export function setActionBarAdSuppression(root: HTMLElement, suppressed: boolean) {
  if (suppressed) root.setAttribute(ACTION_BAR_AD_SUPPRESSION_ATTRIBUTE, "")
  else root.removeAttribute(ACTION_BAR_AD_SUPPRESSION_ATTRIBUTE)
}
