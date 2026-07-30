import { createPortal } from "react-dom"
import { useEffect } from "react"
import { Focus, ExternalLink } from "lucide-react"
import { Link } from "react-router-dom"
import type { Instance } from "@/pages/Instance/InstancePage"
import { usePortalContainer } from "@/components/ui/PortalContainerContext"

/** Build an armory URL for a player GUID, or undefined if not a known player or no realm. */
// eslint-disable-next-line react-refresh/only-export-components
export function getArmoryUrl(instance: Instance, playerId: string): string | undefined {
  const player = instance.players?.[playerId]
  if (!player || !instance.realm) return undefined
  return `/armory/${encodeURIComponent(instance.realm)}/${encodeURIComponent(playerId)}`
}

export interface RowContextMenuProps {
  position: { x: number; y: number }
  playerName: string
  onFocus: () => void
  onClose: () => void
  /** If provided, a "View Armory" link is shown */
  armoryUrl?: string
  /** Hide the "Focus" button (useful when there's no breakout view) */
  hideFocus?: boolean
}

export function RowContextMenu({ position, playerName, onFocus, onClose, armoryUrl, hideFocus }: RowContextMenuProps) {
  const portalContainer = usePortalContainer()
  const portalDocument = portalContainer?.ownerDocument
  const portalWindow = portalDocument?.defaultView

  useEffect(() => {
    if (!portalDocument || !portalWindow) return
    const handler = () => onClose()
    // Defer listener setup so the triggering click event doesn't immediately close the menu
    const frame = portalWindow.requestAnimationFrame(() => {
      portalDocument.addEventListener("click", handler)
    })
    return () => {
      portalWindow.cancelAnimationFrame(frame)
      portalDocument.removeEventListener("click", handler)
    }
  }, [onClose, portalDocument, portalWindow])

  const btnClass = "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground cursor-pointer"

  if (!portalContainer) return null

  return createPortal(
    <div
      className="fixed z-50 min-w-[160px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: position.x, top: position.y }}
    >
      {!hideFocus && (
        <button
          className={btnClass}
          onClick={(e) => { e.stopPropagation(); onFocus(); onClose() }}
        >
          <Focus className="h-3.5 w-3.5" />
          Focus {playerName}
        </button>
      )}
      {armoryUrl && (
        <Link
          to={armoryUrl}
          target="_blank"
          className={btnClass}
          onClick={(e) => { e.stopPropagation(); onClose() }}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View Armory
        </Link>
      )}
    </div>,
    portalContainer,
  )
}
