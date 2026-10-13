export function showDebugDesktopControls(
  searchParams: Pick<URLSearchParams, "get">,
  isMobile: boolean,
): boolean {
  return !isMobile && searchParams.get("debug") === "true";
}
