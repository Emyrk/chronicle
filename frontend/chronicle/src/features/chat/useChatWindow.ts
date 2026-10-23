import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { openChatPopup, syncPopupAppearance, type PanelPopup } from "@/pages/Instance/EventsPanels/panelPopup";

// "minimized" keeps the chat mounted but hidden behind its launcher bubble.
// "popout" renders the same React tree into a separate browser window.
export type ChatWindowMode = "minimized" | "floating" | "popout";

export interface ChatWindowController {
  mode: ChatWindowMode;
  expanded: boolean;
  popup: PanelPopup | null;
  open: () => void;
  minimize: () => void;
  toggleExpanded: () => void;
  popOut: () => void;
  dock: () => void;
}

/**
 * Owns the chat's window state. Keep this in a component that outlives the
 * chat controller so remounting the chat does not close a popped-out window.
 */
export function useChatWindow(name: string, title: string): ChatWindowController {
  const [mode, setMode] = useState<ChatWindowMode>("minimized");
  const [expanded, setExpanded] = useState(false);
  const [popup, setPopup] = useState<PanelPopup | null>(null);
  const popupRef = useRef<PanelPopup | null>(null);

  const closePopup = useCallback(() => {
    const current = popupRef.current;
    popupRef.current = null;
    setPopup(null);
    if (current && !current.window.closed) current.window.close();
  }, []);

  const open = useCallback(() => {
    const current = popupRef.current;
    if (current && !current.window.closed) {
      current.window.focus();
      return;
    }
    setMode("floating");
  }, []);

  const minimize = useCallback(() => {
    closePopup();
    setMode("minimized");
  }, [closePopup]);

  const dock = useCallback(() => {
    closePopup();
    setMode("floating");
  }, [closePopup]);

  const popOut = useCallback(() => {
    const existing = popupRef.current;
    if (existing && !existing.window.closed) {
      existing.window.focus();
      return;
    }
    const next = openChatPopup(window, name, `${title} — Chronicle`);
    if (!next) {
      toast.error("The chat popup was blocked. Allow popups for Chronicle and try again.");
      return;
    }
    popupRef.current = next;
    setPopup(next);
    setMode("popout");
    next.window.focus();
  }, [name, title]);

  useEffect(() => {
    if (!popup) return;
    const popupWindow = popup.window;
    // Closing the native window docks the chat back into the page.
    const handleClose = () => {
      if (popupRef.current?.window !== popupWindow) return;
      popupRef.current = null;
      setPopup(null);
      setMode("floating");
    };
    const syncAppearance = () => {
      if (!popupWindow.closed) syncPopupAppearance(document, popupWindow.document);
    };
    popupWindow.addEventListener("beforeunload", handleClose);
    const observer = new MutationObserver(syncAppearance);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => {
      popupWindow.removeEventListener("beforeunload", handleClose);
      observer.disconnect();
    };
  }, [popup]);

  useEffect(() => () => {
    const current = popupRef.current;
    popupRef.current = null;
    if (current && !current.window.closed) current.window.close();
  }, []);

  return {
    mode,
    expanded,
    popup,
    open,
    minimize,
    toggleExpanded: useCallback(() => setExpanded((value) => !value), []),
    popOut,
    dock,
  };
}
