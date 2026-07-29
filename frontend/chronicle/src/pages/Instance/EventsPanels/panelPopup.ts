export const PANEL_POPUP_FEATURES = [
  "popup=yes",
  "width=900",
  "height=650",
  "resizable=yes",
  "scrollbars=yes",
].join(",");

export interface PanelPopup {
  window: Window;
  container: HTMLElement;
}

export function panelPopupName(panelId: string): string {
  const safePanelId = panelId.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `chronicle-panel-${safePanelId}`;
}

function copyStyles(source: Document, target: Document): void {
  const base = target.createElement("base");
  base.href = source.baseURI;
  target.head.appendChild(base);

  const viewport = target.createElement("meta");
  viewport.name = "viewport";
  viewport.content = "width=device-width, initial-scale=1";
  target.head.appendChild(viewport);

  source
    .querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel~="stylesheet"], style')
    .forEach((node) => target.head.appendChild(node.cloneNode(true)));

  const popupStyles = target.createElement("style");
  popupStyles.textContent = `
    html, body, #chronicle-panel-popup-root {
      width: 100%;
      height: 100%;
      margin: 0;
    }
    body { overflow: hidden; }
  `;
  target.head.appendChild(popupStyles);
}

export function syncPopupAppearance(source: Document, target: Document): void {
  target.documentElement.className = source.documentElement.className;
  target.body.className = source.body.className;

  for (const attribute of ["data-theme", "style"]) {
    const value = source.documentElement.getAttribute(attribute);
    if (value === null) {
      target.documentElement.removeAttribute(attribute);
    } else {
      target.documentElement.setAttribute(attribute, value);
    }
  }
}

export function openPanelPopup(
  ownerWindow: Window,
  panelId: string,
  title: string,
): PanelPopup | null {
  const popupWindow = ownerWindow.open(
    "",
    panelPopupName(panelId),
    PANEL_POPUP_FEATURES,
  );
  if (!popupWindow) return null;

  const popupDocument = popupWindow.document;
  popupDocument.head.replaceChildren();
  popupDocument.body.replaceChildren();
  copyStyles(ownerWindow.document, popupDocument);
  syncPopupAppearance(ownerWindow.document, popupDocument);
  popupDocument.title = title;

  const container = popupDocument.createElement("div");
  container.id = "chronicle-panel-popup-root";
  popupDocument.body.appendChild(container);

  return { window: popupWindow, container };
}
