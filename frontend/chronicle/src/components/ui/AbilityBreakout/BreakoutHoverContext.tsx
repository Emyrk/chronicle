/**
 * Context for synchronizing hover and selection state across multiple breakout tables.
 * When hovering over a cell, highlights the row and column across all tables.
 * When selecting abilities, the selection is shared across all tables.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface BreakoutHoverState {
  /** The hovered row identifier (ability name or target name) */
  rowId: string | null;
  /** The hovered column header (e.g., "Damage", "Crit%", "%") */
  columnId: string | null;
}

interface BreakoutHoverContextValue {
  hover: BreakoutHoverState;
  setHover: (state: BreakoutHoverState) => void;
  clearHover: () => void;
  // Selection state shared across panels
  selectedAbilities: Set<string>;
  toggleAbilitySelection: (name: string) => void;
  clearSelection: () => void;
}

const BreakoutHoverContext = createContext<BreakoutHoverContextValue | null>(null);

export function BreakoutHoverProvider({
  children,
  hover: controlledHover,
  selectedAbilities: controlledSelection,
}: {
  children: ReactNode;
  /** Controlled hover state (optional - defaults to internal state) */
  hover?: BreakoutHoverState;
  /** Controlled selection (optional - defaults to internal state) */
  selectedAbilities?: Set<string>;
}) {
  const [internalHover, setHoverState] = useState<BreakoutHoverState>({ rowId: null, columnId: null });
  const [internalSelection, setSelectedAbilities] = useState<Set<string>>(new Set());
  const hover = controlledHover ?? internalHover;
  const selectedAbilities = controlledSelection ?? internalSelection;

  const setHover = useCallback((state: BreakoutHoverState) => {
    setHoverState(state);
  }, []);

  const clearHover = useCallback(() => {
    setHoverState({ rowId: null, columnId: null });
  }, []);

  const toggleAbilitySelection = useCallback((name: string) => {
    setSelectedAbilities(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedAbilities(new Set());
  }, []);

  return (
    <BreakoutHoverContext.Provider value={{ 
      hover, setHover, clearHover,
      selectedAbilities, toggleAbilitySelection, clearSelection
    }}>
      {children}
    </BreakoutHoverContext.Provider>
  );
}

export function useBreakoutHover() {
  const context = useContext(BreakoutHoverContext);
  // Return a no-op context if not within a provider (tables work standalone)
  if (!context) {
    return {
      hover: { rowId: null, columnId: null },
      setHover: () => {},
      clearHover: () => {},
      selectedAbilities: new Set<string>(),
      toggleAbilitySelection: () => {},
      clearSelection: () => {},
    };
  }
  return context;
}

/**
 * Helper to determine cell highlight state based on hover context.
 */
export function getCellHighlight(
  hover: BreakoutHoverState,
  rowId: string,
  columnId: string
): 'none' | 'row' | 'column' | 'intersection' {
  const rowMatch = hover.rowId === rowId;
  const colMatch = hover.columnId === columnId;

  if (rowMatch && colMatch) return 'intersection';
  if (rowMatch) return 'row';
  if (colMatch) return 'column';
  return 'none';
}
