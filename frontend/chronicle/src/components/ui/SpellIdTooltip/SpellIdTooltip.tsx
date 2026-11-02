import { useState, useRef, useEffect, type ReactNode } from "react";
import { useSpell } from "@/api/queries";
import { useDatasetId } from "@/hooks/useDatasetId";
import { SpellTooltip } from "@/pages/WoWDB/SpellTooltip";
import { Tooltip, TooltipContent, TooltipTrigger } from "../Tooltip/tooltip";
import { SpellIconWithTooltip } from "../SpellIconWithTooltip";
import type { WoWSpell } from "@/api/wowdb";

interface SpellIdTooltipProps {
  /** Spell ID to look up. If null, just shows the name as plain text. */
  spellId: number | null;
  /** Fallback display name when spell data isn't loaded or spellId is null */
  name: string;
  /** Icon size in pixels. Defaults to 16. */
  size?: number;
  /** Fetch spell data only after the tooltip is opened and render a text-only trigger. Defaults to false. */
  loadOnHover?: boolean;
  /** Show the spell rank once metadata has loaded. */
  showRank?: boolean;
  /** Optional preloaded spell metadata. When provided, no spell query is made. */
  spell?: WoWSpell;
  /** Additional class name for the wrapper */
  className?: string;
  /** Optional content rendered above the spell tooltip. */
  tooltipHeader?: ReactNode;
  /** Optional content rendered inside the spell tooltip below its spell details. */
  tooltipFooter?: ReactNode;
}

/**
 * Displays a spell name with an icon that shows a tooltip on hover.
 * Lazy-loads the spell data only when visible on screen (IntersectionObserver).
 * Cross-spell references (like $3137s1) are resolved by SpellTooltip internally.
 * 
 * If spellId is null, renders just the name as plain text.
 */
export function SpellIdTooltip({ 
  spellId, 
  name, 
  size = 16,
  loadOnHover = false,
  showRank = false,
  spell: preloadedSpell,
  className,
  tooltipHeader,
  tooltipFooter,
}: SpellIdTooltipProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipRequested, setTooltipRequested] = useState(false);
  
  // Use IntersectionObserver to detect when element becomes visible
  useEffect(() => {
    if (loadOnHover || !ref.current || spellId == null) return;
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          // Once visible, no need to observe anymore
          observer.disconnect();
        }
      },
      { rootMargin: "50px" } // Start loading slightly before visible
    );
    
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [loadOnHover, spellId]);
  
  // Only fetch when visible and we have a spell ID
  const datasetId = useDatasetId();
  const { data: queriedSpell } = useSpell(
    spellId?.toString() ?? "",
    datasetId,
    {
      enabled:
        preloadedSpell == null &&
        spellId != null &&
        (loadOnHover ? tooltipRequested : isVisible),
    },
  );
  const spell = preloadedSpell ?? queriedSpell;

  // No spell ID - render plain text
  if (spellId == null) {
    return <span className={className}>{name}</span>;
  }

  const rank = showRank ? spell?.subtext?.["0"] : undefined;

  if (loadOnHover) {
    return (
      <Tooltip onOpenChange={(open) => open && setTooltipRequested(true)}>
        <TooltipTrigger asChild>
          <span ref={ref} className={className}>
            {name}
            {rank && <span className="text-2xs text-muted-foreground/70">{rank}</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="start"
          sideOffset={8}
          className="z-[10000] border-0 bg-transparent p-0"
          hideArrow
        >
          {tooltipHeader}
          {spell ? <SpellTooltip spell={spell} footer={tooltipFooter} /> : <span className="rounded bg-popover px-2 py-1 text-xs text-popover-foreground">Loading…</span>}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <span ref={ref} className={className}>
      {spell ? (
        <SpellIconWithTooltip 
          spell={spell} 
          size={size}
          showTooltip
          tooltipHeader={tooltipHeader}
          tooltipFooter={tooltipFooter}
        >
          {name}
        </SpellIconWithTooltip>
      ) : (
        // Show name while loading or if fetch fails
        <span>{name}</span>
      )}
      {rank && <span className="text-2xs text-muted-foreground/70">{rank}</span>}
    </span>
  );
}
