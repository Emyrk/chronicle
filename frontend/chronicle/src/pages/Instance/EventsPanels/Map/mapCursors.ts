// The Map panel's mouse cursors, drawn in the style of WoW's: a gold-trimmed
// gauntlet over the map, a sword over an enemy. Original SVG art (not the
// game's), as CSS cursor values. No three.js: the legend page can use them.

const OUTLINE = "#1c1208";

// A gauntlet pointing up and left, its fingertip at (2, 2).
const GAUNTLET_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
<defs>
<linearGradient id="glove" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0c0"/><stop offset="0.45" stop-color="#e0aa3e"/><stop offset="1" stop-color="#8a5a12"/></linearGradient>
<linearGradient id="cuff" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b0703a"/><stop offset="0.6" stop-color="#6e3a16"/><stop offset="1" stop-color="#3a1c08"/></linearGradient>
</defs>
<g transform="translate(2 2) rotate(-32) translate(-3.5 0)" stroke="${OUTLINE}" stroke-width="1.2" stroke-linejoin="round">
<path d="M1.5 3.5 Q1.5 0 3.5 0 Q5.5 0 5.5 3.5 L5.5 11 L13 11 Q15.5 11 15.5 13.5 L15.5 19 Q15.5 22 12.5 22 L4 22 Q-1.5 22 -2.5 16 L-3 13 Q-3 11 -1 11.5 L1.5 13 Z" fill="url(#glove)"/>
<path d="M5.5 11 L5.5 14 M9 11 L9 14.5 M12.5 11 L12.5 14.5" fill="none" stroke-width="0.9"/>
<path d="M-1 21 L16.5 21 L18 28 L-3 28 Z" fill="url(#cuff)"/>
<path d="M-0.6 22.6 L16.8 22.6" fill="none" stroke="#ffd36b" stroke-width="1"/>
</g>
</svg>`;

// A sword pointing up and left, its tip at (2, 2).
const SWORD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
<defs>
<linearGradient id="blade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#c9ced6"/><stop offset="1" stop-color="#6b7280"/></linearGradient>
<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="0.5" stop-color="#d4a017"/><stop offset="1" stop-color="#7a5200"/></linearGradient>
</defs>
<g transform="translate(2 2) rotate(-45)" stroke="${OUTLINE}" stroke-width="1.2" stroke-linejoin="round">
<path d="M0 0 L2.6 4 L2.6 24 L-2.6 24 L-2.6 4 Z" fill="url(#blade)"/>
<path d="M0 4 L0 23" fill="none" stroke="#4b5563" stroke-width="0.7"/>
<path d="M-7 24 L7 24 L6 27 L-6 27 Z" fill="url(#gold)"/>
<path d="M-1.6 27 L1.6 27 L1.6 34 L-1.6 34 Z" fill="#5b3a1a"/>
<circle cx="0" cy="36" r="2.4" fill="url(#gold)"/>
</g>
</svg>`;

function cursor(svg: string, fallback: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 2 2, ${fallback}`;
}

/** Over the map. */
export const MAP_CURSOR = cursor(GAUNTLET_SVG, "default");
/** Over a player or pet: the gauntlet, as WoW's interact hand. */
export const MAP_UNIT_CURSOR = cursor(GAUNTLET_SVG, "pointer");
/** Over an enemy: WoW's attack sword. */
export const MAP_HOSTILE_CURSOR = cursor(SWORD_SVG, "pointer");
