export function shouldShowInstanceAdRail({
  adsEnabled,
  focused,
  ownerAdsFree,
  viewerAdsFree,
}: {
  adsEnabled: boolean
  focused: boolean
  ownerAdsFree: boolean
  viewerAdsFree: boolean
}) {
  return adsEnabled && !focused && !ownerAdsFree && !viewerAdsFree
}
