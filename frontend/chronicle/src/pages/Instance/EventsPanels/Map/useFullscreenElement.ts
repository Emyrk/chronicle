import { useSyncExternalStore } from "react";

function subscribeFullscreen(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}
const currentFullscreenElement = () => document.fullscreenElement;
const noFullscreenElement = () => null;

/** The document's fullscreen element (null outside fullscreen, and on the server), kept current. */
export function useFullscreenElement(): Element | null {
  return useSyncExternalStore(subscribeFullscreen, currentFullscreenElement, noFullscreenElement);
}
