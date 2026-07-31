export function getBreakoutProgressLabel(
  hasData: boolean,
  loading: boolean,
  processing: boolean,
): "Loading..." | "Processing..." | null {
  if (hasData || (!loading && !processing)) return null
  return loading ? "Loading..." : "Processing..."
}
