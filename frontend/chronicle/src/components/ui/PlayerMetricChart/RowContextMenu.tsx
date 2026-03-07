import { createPortal } from "react-dom"
import { useEffect } from "react"
import { Focus } from "lucide-react"

export interface RowContextMenuProps {
  position: { x: number; y: number }
  playerName: string
  onFocus: () => void
  onClose: () => void
}

export function RowContextMenu({ position, playerName, onFocus, onClose }: RowContextMenuProps) {
  useEffect(() => {
    const handler = () => onClose()
    // Defer listener setup so the triggering contextmenu event doesn't immediately close the menu
    const frame = requestAnimationFrame(() => {
      document.addEventListener("click", handler)
      document.addEventListener("contextmenu", handler)
    })
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener("click", handler)
      document.removeEventListener("contextmenu", handler)
    }
  }, [onClose])

  return createPortal(
    <div
      className="fixed z-50 min-w-[160px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: position.x, top: position.y }}
    >
      <button
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground cursor-pointer"
        onClick={(e) => { e.stopPropagation(); onFocus(); onClose() }}
      >
        <Focus className="h-3.5 w-3.5" />
        Focus {playerName}
      </button>
    </div>,
    document.body,
  )
}
