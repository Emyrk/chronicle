/**
 * Shared accessible glossary system for Explain pages.
 *
 * Terms are rendered bold inline. Definitions are revealed on
 * click/touch and keyboard (Enter/Space), with optional hover.
 */

import { useState, useRef, useEffect, type ReactNode, type KeyboardEvent } from "react";
import { GLOSSARY_TERMS } from "./glossaryTerms";

// Re-export for convenience
export { GLOSSARY_TERMS, type GlossaryTerm } from "./glossaryTerms";

interface GlossaryTermInlineProps {
  /** Key into GLOSSARY_TERMS */
  termKey: string;
  /** Override the display text (defaults to term.term) */
  children?: ReactNode;
}

/**
 * Inline glossary term with accessible popover definition.
 *
 * - Bold text
 * - Click/touch and Enter/Space reveal the definition
 * - Hover optionally shows the definition
 * - Escape dismisses
 */
export function GlossaryTermInline({ termKey, children }: GlossaryTermInlineProps) {
  const term = GLOSSARY_TERMS[termKey];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  if (!term) {
    // Unknown term — render as bold text without interaction
    return <strong>{children ?? termKey}</strong>;
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((prev) => !prev);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const handleClick = () => {
    setOpen((prev) => !prev);
  };

  return (
    <span className="relative inline-block">
      <span
        ref={ref}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`${term.term}: ${term.definition}`}
        data-testid={`glossary-term-${termKey}`}
        className="font-bold underline decoration-dotted decoration-muted-foreground/50 cursor-pointer hover:text-primary transition-colors"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        {children ?? term.term}
      </span>
      {open && <GlossaryPopover definition={term.definition} onDismiss={() => setOpen(false)} />}
    </span>
  );
}

function GlossaryPopover({ definition, onDismiss }: { definition: string; onDismiss: () => void }) {
  const popRef = useRef<HTMLDivElement>(null);

  // Close on click-outside or Escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onDismiss]);

  return (
    <div
      ref={popRef}
      role="tooltip"
      data-testid="glossary-popover"
      className="absolute left-0 top-full mt-1 z-50 w-64 rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-md animate-in fade-in-50 slide-in-from-top-1"
    >
      {definition}
    </div>
  );
}
