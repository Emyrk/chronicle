import { useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react"

import { clampSideWidth, MIN_SIDE_WIDTH } from "./paneWidth"

const KEY_STEP = 24

/**
 * Draggable divider between the workshop's main area and its right-hand column. The width is measured
 * from the container's right edge; double-click resets to the default width.
 */
export function PaneResizer({ containerRef, width, onDrag, onCommit, className = "" }: {
  containerRef: RefObject<HTMLElement | null>
  /** Current side width in px, or null for the default. */
  width: number | null
  onDrag: (width: number) => void
  /** Called when a drag or key press finishes; null resets to the default width. */
  onCommit: (width: number | null) => void
  className?: string
}) {
  const [dragging, setDragging] = useState(false)
  const latest = useRef<number | null>(null)
  const measure = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    return rect ? clampSideWidth(rect.right - clientX, rect.width) : null
  }
  const currentWidth = () => {
    if (width !== null) return width
    // Default width: read the side track from the grid's resolved columns ("812px 468px").
    const columns = containerRef.current ? getComputedStyle(containerRef.current).gridTemplateColumns.split(" ") : []
    return Number.parseFloat(columns.at(-1) ?? "") || MIN_SIDE_WIDTH
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    latest.current = null
    setDragging(true)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    const next = measure(event.clientX)
    if (next !== null) { latest.current = next; onDrag(next) }
  }
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    setDragging(false)
    if (latest.current !== null) onCommit(latest.current)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    // Left arrow moves the divider left, which widens the right-hand column.
    const delta = event.key === "ArrowLeft" ? KEY_STEP : event.key === "ArrowRight" ? -KEY_STEP : 0
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault()
      onCommit(event.key === "Home" ? clampSideWidth(Infinity, rect.width) : MIN_SIDE_WIDTH)
    } else if (delta) {
      event.preventDefault()
      onCommit(clampSideWidth(currentWidth() + delta, rect.width))
    }
  }

  return <div className={`relative z-20 w-0 justify-self-start ${className}`}>
    {/* The visible line; the wider invisible strip around it is the drag target. */}
    <div aria-hidden className={`pointer-events-none absolute inset-y-0 -left-px w-0.5 transition-colors ${dragging ? "bg-primary" : "bg-foreground/25"}`} />
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize side panel"
      aria-valuenow={width ?? undefined}
      aria-valuemin={MIN_SIDE_WIDTH}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onDoubleClick={() => onCommit(null)}
      onKeyDown={onKeyDown}
      className="group absolute inset-y-0 -left-1.5 w-3 cursor-col-resize touch-none outline-none"
    >
      <div className={`mx-auto h-full w-0.5 transition-colors group-hover:bg-primary/70 group-focus-visible:bg-primary ${dragging ? "bg-primary" : ""}`} />
    </div>
    {/* Keeps the cursor and stops text selection while dragging over the panes. */}
    {dragging && <div className="fixed inset-0 z-50 cursor-col-resize select-none" />}
  </div>
}
