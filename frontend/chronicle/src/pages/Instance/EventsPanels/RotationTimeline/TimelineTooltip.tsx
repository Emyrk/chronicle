import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePortalContainer } from "@/components/ui/PortalContainerContext";

/** Where a portaled tooltip opens, in viewport coordinates of its window. */
export interface TooltipAnchor {
  x: number;
  /** Top of the space below the lane, and bottom of the space above it. */
  below: number;
  above: number;
  win: Window;
}

/** Opens above the lane when there is less room than this below and more above. */
const TOOLTIP_FLIP_SPACE = 260;
const TOOLTIP_MARGIN = 8;

/**
 * Shared frame for the lane tooltips. Portaled out of the timeline card, which
 * clips its content, and placed in viewport coordinates: below the lane, or
 * above it when there is more room there, never taller than the space.
 */
export function TooltipShell({ anchor, width, children }: { anchor: TooltipAnchor | null; width: number; children: ReactNode }) {
  const container = usePortalContainer();
  if (!anchor || !container) return null;
  const { win } = anchor;
  const spaceBelow = win.innerHeight - anchor.below - TOOLTIP_MARGIN;
  const spaceAbove = anchor.above - TOOLTIP_MARGIN;
  const flip = spaceBelow < TOOLTIP_FLIP_SPACE && spaceAbove > spaceBelow;
  const left = Math.min(Math.max(anchor.x - width / 2, TOOLTIP_MARGIN), win.innerWidth - width - TOOLTIP_MARGIN);
  return createPortal(
    <div
      className="pointer-events-none fixed z-50 flex flex-col gap-2 overflow-hidden rounded-md border border-border bg-popover p-3 text-[11px] text-foreground shadow-xl"
      style={{
        left,
        width,
        ...(flip
          ? { bottom: win.innerHeight - anchor.above + 4, maxHeight: spaceAbove - 4 }
          : { top: anchor.below + 4, maxHeight: spaceBelow - 4 }),
      }}
    >
      {children}
    </div>,
    container,
  );
}

export function TooltipHeader({ icon, title, subtitle, failed }: { icon: string; title: string; subtitle: string; failed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="size-9 shrink-0 rounded-[4px] border border-border bg-muted bg-cover bg-center"
        style={{ backgroundImage: `url(${icon})` }}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-base font-medium leading-tight text-foreground">
          {title}
          {failed && <span className="ml-1.5 text-xs text-destructive">failed</span>}
        </span>
        <span className="truncate font-mono text-[11px] text-muted-foreground">{subtitle}</span>
      </div>
    </div>
  );
}
