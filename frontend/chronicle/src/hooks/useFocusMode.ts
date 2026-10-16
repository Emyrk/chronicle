import { useCallback } from "react";
import { useMatch, useSearchParams } from "react-router-dom";

export const FOCUS_PARAM = "focus";

/**
 * Focus mode (`?focus=1`): the instance page shows only the encounter
 * sidebar, the preset row and the layout; the site chrome is hidden. In the
 * URL so it survives a refresh and share links can open straight into it.
 */
export function useFocusMode(): [boolean, (focused: boolean) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const focused = searchParams.get(FOCUS_PARAM) === "1";
  const setFocused = useCallback((next: boolean) => {
    setSearchParams((previous) => {
      const params = new URLSearchParams(previous);
      if (next) params.set(FOCUS_PARAM, "1");
      else params.delete(FOCUS_PARAM);
      return params;
    }, { replace: true });
  }, [setSearchParams]);
  return [focused, setFocused];
}

/** Whether the site chrome (banners, navbar, footer) should hide: focus mode on an instance page. */
export function useHideSiteChrome(): boolean {
  const onInstancePage = useMatch("/instances/:instanceId") !== null;
  const [focused] = useFocusMode();
  return onInstancePage && focused;
}
