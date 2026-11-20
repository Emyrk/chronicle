import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react"

import { PANEL_GRID_ROW_HEIGHT_PX } from "../Instance/panelGridRows"

/** A fixed preview size in px; null fills the canvas. */
export type FrameSize = { width: number; height: number } | null

const MIN_WIDTH = 200
const MIN_HEIGHT = 120
const GRID_GAP = 12
/** Content width of the instance page's 12-column panel grid on a 1440px-wide window. */
const REFERENCE_GRID_WIDTH = 1392

/** Pixel size of a panel spanning w of 12 columns and h rows on the instance page. */
function gridPanelSize(w: number, h: number): { width: number; height: number } {
  const column = (REFERENCE_GRID_WIDTH - 11 * GRID_GAP) / 12
  return { width: Math.round(column * w + GRID_GAP * (w - 1)), height: h * PANEL_GRID_ROW_HEIGHT_PX + GRID_GAP * (h - 1) }
}

const PRESETS = [
  { label: "12×4", title: "Full-width panel, 4 rows (like the default line chart)", w: 12, h: 4 },
  { label: "6×5", title: "Half-width panel, 5 rows (like the default meters)", w: 6, h: 5 },
  { label: "4×4", title: "Third-width panel, 4 rows (like the mini map)", w: 4, h: 4 },
] as const

function sameSize(a: FrameSize, b: FrameSize) {
  return a === b || (!!a && !!b && a.width === b.width && a.height === b.height)
}

/** Size presets for the preview frame, sized like panels on the instance page's 1440px grid. */
export function FrameSizeControls({ size, measured, onChange }: { size: FrameSize; measured: { width: number; height: number } | null; onChange: (size: FrameSize) => void }) {
  const shown = measured ?? size
  const option = (active: boolean) => `rounded px-1.5 py-0.5 ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`
  return <div className="flex items-center gap-2 text-[11px]">
    <div role="group" aria-label="Preview size" className="flex rounded-md border border-border p-0.5">
      <button type="button" aria-pressed={!size} className={option(!size)} onClick={() => onChange(null)} title="Fill the canvas">Fill</button>
      {PRESETS.map(preset => {
        const value = gridPanelSize(preset.w, preset.h)
        return <button key={preset.label} type="button" aria-pressed={sameSize(size, value)} className={option(sameSize(size, value))}
          onClick={() => onChange(value)} title={`${preset.title} · ${value.width}×${value.height}`}>{preset.label}</button>
      })}
    </div>
    {shown && <span className="font-mono tabular-nums text-muted-foreground" aria-label="Preview size in pixels">{shown.width}×{shown.height}</span>}
  </div>
}

/**
 * Holds the preview at a fixed size so authors can check how a panel lays out at the sizes people
 * give it. Drag the right edge, bottom edge or corner to resize; double-click a handle to fill again.
 */
export function PreviewFrame({ size, onChange, onMeasure, children }: {
  size: FrameSize
  onChange: (size: FrameSize) => void
  onMeasure: (size: { width: number; height: number }) => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ x: boolean; y: boolean } | null>(null)
  const [live, setLive] = useState<FrameSize>(null)
  const shown = live ?? size

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize?.[0]
      onMeasure({ width: Math.round(box?.inlineSize ?? entry.contentRect.width), height: Math.round(box?.blockSize ?? entry.contentRect.height) })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [onMeasure])

  const start = (x: boolean, y: boolean) => (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ x, y })
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!drag || !rect) return
    setLive({
      width: Math.round(drag.x ? Math.max(MIN_WIDTH, event.clientX - rect.left) : rect.width),
      height: Math.round(drag.y ? Math.max(MIN_HEIGHT, event.clientY - rect.top) : rect.height),
    })
  }
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    setDrag(null)
    if (live) onChange(live)
    setLive(null)
  }
  const handle = (x: boolean, y: boolean, label: string, className: string) => <div role="separator" aria-label={label}
    title="Drag to resize · double-click to fill the canvas" onPointerDown={start(x, y)} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}
    onDoubleClick={() => onChange(null)} className={`group absolute z-10 touch-none ${className}`}>
    <div className={`absolute rounded-full transition-colors group-hover:bg-primary/70 ${drag?.x === x && drag?.y === y ? "bg-primary" : ""} ${x && y ? "inset-1" : x ? "inset-y-0 left-1/2 w-0.5" : "inset-x-0 top-1/2 h-0.5"}`} />
  </div>

  return <div className={shown ? "relative shrink-0 self-start" : "relative flex min-h-0 flex-1 flex-col"}
    style={shown ? { width: shown.width, height: shown.height } : undefined}>
    <div ref={ref} className={`flex size-full min-h-0 flex-col ${shown ? "outline-dashed outline-1 outline-offset-2 outline-primary/40" : "flex-1"}`}>{children}</div>
    {handle(true, false, "Resize preview width", "-right-2 top-0 h-full w-3 cursor-ew-resize")}
    {handle(false, true, "Resize preview height", "-bottom-2 left-0 h-3 w-full cursor-ns-resize")}
    {handle(true, true, "Resize preview", "-bottom-2.5 -right-2.5 size-4 cursor-nwse-resize")}
    {drag && <div className={`fixed inset-0 z-50 select-none ${drag.x && drag.y ? "cursor-nwse-resize" : drag.x ? "cursor-ew-resize" : "cursor-ns-resize"}`} />}
  </div>
}
