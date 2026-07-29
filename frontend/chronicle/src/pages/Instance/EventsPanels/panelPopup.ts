export const PANEL_POPUP_FEATURES = [
  "popup=yes",
  "width=900",
  "height=650",
  "resizable=yes",
  "scrollbars=yes",
].join(",");

export const LAYOUT_POPUP_FEATURES = [
  "popup=yes",
  "width=1400",
  "height=900",
  "resizable=yes",
  "scrollbars=yes",
].join(",");

export interface PanelPopup {
  window: Window;
  container: HTMLElement;
}

export type LayoutPopup = PanelPopup;

export function panelPopupName(panelId: string): string {
  const safePanelId = panelId.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `chronicle-panel-${safePanelId}`;
}

function copyStyles(
  source: Document,
  target: Document,
  rootId: string,
  bodyOverflow: "hidden" | "auto",
): void {
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
    html, body, #${rootId} {
      width: 100%;
      height: 100%;
      min-height: 100%;
      margin: 0;
    }
    body { overflow: ${bodyOverflow}; }
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

function openPopup(
  ownerWindow: Window,
  name: string,
  title: string,
  features: string,
  rootId: string,
  bodyOverflow: "hidden" | "auto",
): PanelPopup | null {
  const popupWindow = ownerWindow.open("", name, features);
  if (!popupWindow) return null;

  const popupDocument = popupWindow.document;
  popupDocument.head.replaceChildren();
  popupDocument.body.replaceChildren();
  copyStyles(ownerWindow.document, popupDocument, rootId, bodyOverflow);
  syncPopupAppearance(ownerWindow.document, popupDocument);
  popupDocument.title = title;

  const container = popupDocument.createElement("div");
  container.id = rootId;
  popupDocument.body.appendChild(container);

  return { window: popupWindow, container };
}

export function openPanelPopup(
  ownerWindow: Window,
  panelId: string,
  title: string,
): PanelPopup | null {
  return openPopup(
    ownerWindow,
    panelPopupName(panelId),
    title,
    PANEL_POPUP_FEATURES,
    "chronicle-panel-popup-root",
    "hidden",
  );
}

export function openLayoutPopup(
  ownerWindow: Window,
  instanceId: string,
  title: string,
): LayoutPopup | null {
  return openPopup(
    ownerWindow,
    `chronicle-layout-${instanceId}`,
    title,
    LAYOUT_POPUP_FEATURES,
    "chronicle-layout-popup-root",
    "auto",
  );
}
