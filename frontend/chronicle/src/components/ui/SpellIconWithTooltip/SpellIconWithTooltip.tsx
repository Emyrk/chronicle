import type { WoWSpell, LocaleIndex } from "@/api/wowdb";
import { getSpellIconUrl } from "@/api/wowdb";
import { SpellTooltip } from "@/pages/WoWDB/SpellTooltip";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface SpellIconWithTooltipProps {
  spell: WoWSpell;
  locale?: LocaleIndex;
  /** Icon size in pixels. Defaults to 24. */
  size?: number;
  /** Additional classes for the icon image */
  className?: string;
  /** Whether to show the tooltip. Defaults to true. */
  showTooltip?: boolean;
  /** Show detailed tooltip with duration and aura effects. Defaults to false. */
  detailed?: boolean;
  /** Optional children to render alongside the icon (e.g., spell name). Both will trigger the tooltip. */
  children?: ReactNode;
  /** Optional header rendered above the spell tooltip inside the tooltip popover. */
  tooltipHeader?: ReactNode;
}

/**
 * A spell icon that shows the full SpellTooltip on hover.
 * Reusable across the site wherever spell icons are displayed.
 * 
 * If children are provided, both the icon and children will be wrapped
 * together and trigger the tooltip on hover.
 */
export function SpellIconWithTooltip({
  spell,
  locale = "0",
  size = 24,
  className,
  showTooltip = true,
  detailed = false,
  children,
  tooltipHeader,
}: SpellIconWithTooltipProps) {
  const iconUrl = getSpellIconUrl(spell.spell_icon);

  const icon = iconUrl ? (
    <img
      src={iconUrl}
      alt=""
      width={size}
      height={size}
      className={cn(
        "rounded border border-yellow-600/40 flex-shrink-0",
        className
      )}
    />
  ) : null;

  const content = children ? (
    <span className="inline-flex items-center gap-2">
      {icon}
      {children}
    </span>
  ) : (
    icon
  );

  if (!content) {
    return null;
  }

  if (!showTooltip) {
    return content;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <span className="cursor-pointer">{content}</span>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="start"
          sideOffset={8}
          className="p-0 bg-transparent border-0 z-[10000]"
          hideArrow
        >
          {tooltipHeader}
          <SpellTooltip spell={spell} locale={locale} detailed={detailed} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
