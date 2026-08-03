/**
 * Glossary term definitions — shared across Explain pages.
 * Separated from the React component for fast-refresh compatibility.
 */

export interface GlossaryTerm {
  /** The term as shown in text (e.g., "Panel") */
  term: string;
  /** Short plain-language definition */
  definition: string;
}

/** Shared glossary terms used across Explain pages. */
export const GLOSSARY_TERMS: Record<string, GlossaryTerm> = {
  panel: {
    term: "Panel",
    definition: "A chart card that shows one category of combat data (damage, healing, etc.).",
  },
  breakoutBox: {
    term: "Breakout Box",
    definition: "The expandable detail view that appears when you click a player row, showing ability and target breakdowns.",
  },
  filters: {
    term: "Filters",
    definition: "Conditions that narrow which events the panel processes — by ability, target type, school, or hit type.",
  },
  focus: {
    term: "Focus",
    definition: "A per-player drill-down that replaces the main chart with that player's per-ability breakdown.",
  },
};
