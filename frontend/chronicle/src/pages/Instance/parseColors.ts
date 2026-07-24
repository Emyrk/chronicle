/**
 * WCL-standard parse score colors and shared pill utilities.
 */

// --- Tailwind class colors ---

export function parseColor(score: number): string {
  if (score >= 100) return "text-amber-400"; // gold
  if (score >= 99) return "text-pink-400"; // pink
  if (score >= 95) return "text-orange-400"; // orange
  if (score >= 75) return "text-purple-400"; // purple
  if (score >= 50) return "text-blue-400"; // blue
  if (score >= 25) return "text-green-400"; // green
  return "text-zinc-400"; // grey
}

export function parseBgColor(score: number): string {
  if (score >= 100) return "bg-amber-400/10";
  if (score >= 99) return "bg-pink-400/10";
  if (score >= 95) return "bg-orange-400/10";
  if (score >= 75) return "bg-purple-400/10";
  if (score >= 50) return "bg-blue-400/10";
  if (score >= 25) return "bg-green-400/10";
  return "bg-zinc-400/10";
}

// --- Raw hex colors for inline styles (bar pills) ---

export function parseHexColor(score: number): string {
  if (score >= 100) return "#fbbf24"; // amber-400
  if (score >= 99) return "#f472b6"; // pink-400
  if (score >= 95) return "#fb923c"; // orange-400
  if (score >= 75) return "#c084fc"; // purple-400
  if (score >= 50) return "#60a5fa"; // blue-400
  if (score >= 25) return "#4ade80"; // green-400
  return "#a1a1aa"; // zinc-400
}

// --- Border color for pill outline ---

export function parseBorderColor(score: number): string {
  if (score >= 100) return "border-amber-400/60";
  if (score >= 99) return "border-pink-400/60";
  if (score >= 95) return "border-orange-400/60";
  if (score >= 75) return "border-purple-400/60";
  if (score >= 50) return "border-blue-400/60";
  if (score >= 25) return "border-green-400/60";
  return "border-zinc-400/60";
}
