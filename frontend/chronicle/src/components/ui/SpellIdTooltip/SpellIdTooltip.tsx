import { useState, useRef, useEffect } from "react";
import { useSpell } from "@/api/queries";
import { useDatasetId } from "@/hooks/useDatasetId";
import { SpellTooltip } from "@/pages/WoWDB/SpellTooltip";
import { Tooltip, TooltipContent, TooltipTrigger } from "../Tooltip/tooltip";
import { SpellIconWithTooltip } from "../SpellIconWithTooltip";

interface SpellIdTooltipProps {
  /** Spell ID to look up. If null, just shows the name as plain text. */
  spellId: number | null;
  /** Fallback display name when spell data isn't loaded or spellId is null */
  name: string;
  /** Icon size in pixels. Defaults to 16. */
  size?: number;
  /** Whether to render the spell icon. Defaults to true. */
  showIcon?: boolean;
  /** Fetch spell data only after the tooltip is opened. Defaults to false. */
  loadOnHover?: boolean;
  /** Additional class name for the wrapper */
  className?: string;
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
  showIcon = true,
  loadOnHover = false,
  className,
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
  const { data: spell } = useSpell(
    spellId?.toString() ?? "",
    datasetId,
    { enabled: spellId != null && (loadOnHover ? tooltipRequested : isVisible) },
  );

  // No spell ID - render plain text
  if (spellId == null) {
    return <span className={className}>{name}</span>;
  }

  if (loadOnHover) {
    return (
      <Tooltip onOpenChange={(open) => open && setTooltipRequested(true)}>
        <TooltipTrigger asChild>
          <span ref={ref} className={className}>{name}</span>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="start"
          sideOffset={8}
          className="z-[10000] border-0 bg-transparent p-0"
          hideArrow
        >
          {spell ? <SpellTooltip spell={spell} /> : <span className="rounded bg-popover px-2 py-1 text-xs text-popover-foreground">Loading…</span>}
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
          showIcon={showIcon}
          showTooltip
        >
          {name}
        </SpellIconWithTooltip>
      ) : (
        // Show name while loading or if fetch fails
        <span>{name}</span>
      )}
    </span>
  );
}
