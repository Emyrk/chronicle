export const ENTITY_OVERLAY_ATTRIBUTE = "data-entity-overlay-open"

export function setEntityOverlayOpen(root: HTMLElement, open: boolean) {
  if (open) root.setAttribute(ENTITY_OVERLAY_ATTRIBUTE, "")
  else root.removeAttribute(ENTITY_OVERLAY_ATTRIBUTE)
}
