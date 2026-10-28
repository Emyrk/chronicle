// Contract with the chooser page served by internal/services/servicechoose.

/** Query param the chooser adds to tell us how the visitor arrived. */
export const ARRIVAL_PARAM = "from_choose";

/**
 * - saved: auto-redirected by a choice saved earlier.
 * - remembered: picked just now and saved for future links.
 * - picked: picked just now without saving.
 */
export type ChooseArrival = "saved" | "remembered" | "picked";

export function parseArrival(value: string | null): ChooseArrival | null {
  return value === "saved" || value === "remembered" || value === "picked" ? value : null;
}

/**
 * Builds a link back to the chooser for the current page. `action` makes the
 * chooser show its picker ("manage") or clear the saved choice first
 * ("forget") instead of auto-redirecting.
 */
export function chooserURL(
  chooseOrigin: string,
  location: { pathname: string; search: string; hash: string },
  action: "manage" | "forget",
): string {
  const url = new URL(location.pathname + location.search + location.hash, chooseOrigin);
  url.searchParams.delete(ARRIVAL_PARAM);
  url.searchParams.set(action === "manage" ? "choose_manage" : "choose_forget", "1");
  return url.toString();
}
