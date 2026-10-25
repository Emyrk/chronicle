export function shouldShowInstanceAdRail({
  adsEnabled,
  previewEnabled,
  focused,
  ownerAdsFree,
  viewerAdsFree,
}: {
  adsEnabled: boolean
  previewEnabled: boolean
  focused: boolean
  ownerAdsFree: boolean
  viewerAdsFree: boolean
}) {
  return (adsEnabled || previewEnabled) && !focused && !ownerAdsFree && !viewerAdsFree
}
