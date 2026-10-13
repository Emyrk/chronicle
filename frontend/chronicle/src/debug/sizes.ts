const PREVIEW_ID = "size-preview-overlay"
const DRAG_THRESHOLD = 4

export interface PreviewSize {
  width: number
  height: number
}

interface SizeGroup {
  label: string
  color: string
  sizes: readonly PreviewSize[]
}

export const SIZE_GROUPS: readonly SizeGroup[] = [
  {
    label: "Anchor",
    color: "#2563eb",
    sizes: [
      { width: 728, height: 90 },
      { width: 320, height: 50 },
      { width: 320, height: 100 },
      { width: 970, height: 90 },
    ],
  },
  {
    label: "Article",
    color: "#7c3aed",
    sizes: [
      { width: 728, height: 90 },
      { width: 970, height: 90 },
      { width: 320, height: 50 },
      { width: 320, height: 100 },
      { width: 300, height: 250 },
    ],
  },
  {
    label: "Side Rail",
    color: "#059669",
    sizes: [
      { width: 160, height: 600 },
      { width: 300, height: 600 },
      { width: 320, height: 480 },
      { width: 300, height: 250 },
    ],
  },
  {
    label: "Sticky Stack",
    color: "#d97706",
    sizes: [
      { width: 300, height: 250 },
      { width: 320, height: 50 },
      { width: 320, height: 100 },
    ],
  },
  {
    label: "Large Leaderboard",
    color: "#dc2626",
    sizes: [{ width: 970, height: 250 }],
  },
]

export const STANDARD_SIZES: readonly PreviewSize[] = Array.from(
  new Map(
    SIZE_GROUPS.flatMap((group) => group.sizes).map((size) => [`${size.width}x${size.height}`, size]),
  ).values(),
)

export function nextSizeIndex(currentIndex: number): number {
  return (currentIndex + 1) % STANDARD_SIZES.length
}

function sizeKey(size: PreviewSize): string {
  return `${size.width}x${size.height}`
}

function applySize(preview: HTMLElement, size: PreviewSize): void {
  preview.style.width = `${size.width}px`
  preview.style.height = `${size.height}px`
  preview.querySelector<HTMLElement>("[data-size-label]")!.textContent = `${size.width} × ${size.height}`
}

function makePanelDraggable(panel: HTMLElement, handle: HTMLElement): void {
  let dragging = false
  let offsetX = 0
  let offsetY = 0

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return

    const bounds = panel.getBoundingClientRect()
    panel.style.left = `${bounds.left}px`
    panel.style.top = `${bounds.top}px`
    panel.style.right = "auto"
    dragging = true
    offsetX = event.clientX - bounds.left
    offsetY = event.clientY - bounds.top
    handle.setPointerCapture(event.pointerId)
  })

  handle.addEventListener("pointermove", (event) => {
    if (!dragging) return

    panel.style.left = `${event.clientX - offsetX}px`
    panel.style.top = `${event.clientY - offsetY}px`
  })

  handle.addEventListener("pointerup", (event) => {
    if (!dragging) return

    dragging = false
    handle.releasePointerCapture(event.pointerId)
  })

  handle.addEventListener("pointercancel", () => {
    dragging = false
  })
}

function createPanel(onSelect: (size: PreviewSize, color: string) => void): HTMLElement {
  const panel = document.createElement("div")
  Object.assign(panel.style, {
    position: "fixed",
    top: "80px",
    right: "16px",
    width: "220px",
    maxHeight: "calc(100vh - 96px)",
    overflowY: "auto",
    padding: "12px",
    borderRadius: "10px",
    background: "rgba(15, 23, 42, 0.96)",
    boxShadow: "0 12px 32px rgba(0, 0, 0, 0.35)",
    boxSizing: "border-box",
    color: "white",
    fontFamily: "sans-serif",
    pointerEvents: "auto",
  })

  const handle = document.createElement("div")
  handle.textContent = "Sizes · drag to move"
  Object.assign(handle.style, {
    margin: "-4px -4px 10px",
    padding: "4px",
    cursor: "move",
    fontSize: "14px",
    fontWeight: "700",
    touchAction: "none",
    userSelect: "none",
  })
  panel.appendChild(handle)
  makePanelDraggable(panel, handle)

  for (const group of SIZE_GROUPS) {
    const heading = document.createElement("div")
    heading.textContent = group.label
    Object.assign(heading.style, {
      margin: "8px 0 6px",
      color: group.color,
      fontSize: "12px",
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: "0.04em",
    })
    panel.appendChild(heading)

    const buttons = document.createElement("div")
    Object.assign(buttons.style, {
      display: "flex",
      flexWrap: "wrap",
      gap: "6px",
    })

    for (const size of group.sizes) {
      const button = document.createElement("button")
      button.type = "button"
      button.dataset.size = sizeKey(size)
      button.textContent = `${size.width} × ${size.height}`
      Object.assign(button.style, {
        padding: "6px 8px",
        border: "0",
        borderRadius: "6px",
        background: group.color,
        color: "white",
        cursor: "pointer",
        font: "600 12px sans-serif",
      })
      button.addEventListener("click", () => onSelect(size, group.color))
      buttons.appendChild(button)
    }

    panel.appendChild(buttons)
  }

  return panel
}

function createPreview(initialSize: PreviewSize, color: string, offset: number): HTMLElement {
  const preview = document.createElement("div")
  Object.assign(preview.style, {
    position: "fixed",
    top: `${100 + offset}px`,
    left: `${100 + offset}px`,
    background: `${color}33`,
    border: `2px dashed ${color}`,
    boxSizing: "border-box",
    cursor: "move",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    alignItems: "center",
    justifyContent: "center",
    color,
    fontFamily: "sans-serif",
    textAlign: "center",
    userSelect: "none",
    touchAction: "none",
    pointerEvents: "auto",
  })

  const closeButton = document.createElement("button")
  closeButton.type = "button"
  closeButton.textContent = "×"
  closeButton.setAttribute("aria-label", "Close size preview")
  Object.assign(closeButton.style, {
    position: "absolute",
    top: "6px",
    right: "6px",
    width: "26px",
    height: "26px",
    padding: "0",
    border: `1px solid ${color}`,
    borderRadius: "999px",
    background: "rgba(255, 255, 255, 0.9)",
    color,
    cursor: "pointer",
    font: "700 20px/22px sans-serif",
    pointerEvents: "auto",
  })
  closeButton.addEventListener("pointerdown", (event) => event.stopPropagation())
  closeButton.addEventListener("click", () => preview.remove())

  const label = document.createElement("strong")
  label.dataset.sizeLabel = ""
  label.style.fontSize = "24px"

  const hint = document.createElement("span")
  hint.textContent = "Click to cycle · drag to move"
  hint.style.fontSize = "12px"
  hint.style.fontWeight = "600"

  preview.append(closeButton, label, hint)

  let sizeIndex = STANDARD_SIZES.findIndex((size) => sizeKey(size) === sizeKey(initialSize))
  let dragging = false
  let moved = false
  let offsetX = 0
  let offsetY = 0
  let startX = 0
  let startY = 0

  applySize(preview, initialSize)

  preview.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return

    dragging = true
    moved = false
    startX = event.clientX
    startY = event.clientY
    offsetX = event.clientX - preview.offsetLeft
    offsetY = event.clientY - preview.offsetTop
    preview.setPointerCapture(event.pointerId)
  })

  preview.addEventListener("pointermove", (event) => {
    if (!dragging) return

    if (Math.hypot(event.clientX - startX, event.clientY - startY) >= DRAG_THRESHOLD) {
      moved = true
    }

    if (!moved) return

    preview.style.left = `${event.clientX - offsetX}px`
    preview.style.top = `${event.clientY - offsetY}px`
  })

  preview.addEventListener("pointerup", (event) => {
    if (!dragging) return

    dragging = false
    preview.releasePointerCapture(event.pointerId)

    if (!moved) {
      sizeIndex = nextSizeIndex(sizeIndex)
      applySize(preview, STANDARD_SIZES[sizeIndex])
    }
  })

  preview.addEventListener("pointercancel", () => {
    dragging = false
  })

  return preview
}

export function sizes(): void {
  document.getElementById(PREVIEW_ID)?.remove()

  const overlay = document.createElement("div")
  overlay.id = PREVIEW_ID
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    pointerEvents: "none",
  })

  let previewCount = 0
  const addPreview = (size: PreviewSize, color: string): void => {
    const offset = (previewCount % 8) * 20
    overlay.appendChild(createPreview(size, color, offset))
    previewCount += 1
  }

  overlay.appendChild(createPanel(addPreview))
  document.body.appendChild(overlay)
  addPreview({ width: 300, height: 600 }, "#059669")
}

if (typeof window !== "undefined") {
  window.sizes = sizes
}
