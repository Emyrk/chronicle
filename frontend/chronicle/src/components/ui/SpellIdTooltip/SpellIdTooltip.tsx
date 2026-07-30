import { useState, useRef, useEffect } from "react";
import { useSpell } from "@/api/queries";
import { useDatasetId } from "@/hooks/useDatasetId";
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
  className,
}: SpellIdTooltipProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  
  // Use IntersectionObserver to detect when element becomes visible
  useEffect(() => {
    if (!ref.current || spellId == null) return;
    
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
  }, [spellId]);
  
  // Only fetch when visible and we have a spell ID
  const datasetId = useDatasetId();
  const { data: spell } = useSpell(
    spellId?.toString() ?? "",
    datasetId,
    { enabled: isVisible && spellId != null },
  );

  // No spell ID - render plain text
  if (spellId == null) {
    return <span className={className}>{name}</span>;
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
