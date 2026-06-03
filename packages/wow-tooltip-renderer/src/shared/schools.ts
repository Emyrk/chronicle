// Spell/damage schools. SCHOOL_TEXT maps the numeric school index to a label;
// SCHOOL_COLORS provides hex colors for consumers to style with.

export const SCHOOL_TEXT: Record<number, string> = {
  0: "Physical",
  1: "Holy",
  2: "Fire",
  3: "Nature",
  4: "Frost",
  5: "Shadow",
  6: "Arcane",
};

/** School index -> hex color (matches Chronicle's --color-school-* tokens). */
export const SCHOOL_COLORS: Record<number, string> = {
  0: "#9ca3af", // Physical (gray-400)
  1: "#fde047", // Holy (yellow-300)
  2: "#f97316", // Fire (orange-500)
  3: "#4ade80", // Nature (green-400)
  4: "#60a5fa", // Frost (blue-400)
  5: "#c084fc", // Shadow (purple-400)
  6: "#f472b6", // Arcane (pink-400)
};

/** Color keyed by school name (e.g. "Fire"), for convenience. */
export const SCHOOL_COLORS_BY_NAME: Record<string, string> = {
  Physical: "#9ca3af",
  Holy: "#fde047",
  Fire: "#f97316",
  Nature: "#4ade80",
  Frost: "#60a5fa",
  Shadow: "#c084fc",
  Arcane: "#f472b6",
};
