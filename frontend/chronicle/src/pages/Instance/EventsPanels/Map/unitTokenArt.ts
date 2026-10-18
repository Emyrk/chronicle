/**
 * The 3D map's unit token art: plain 2D canvas drawing, with no three.js, so
 * the map (which wraps each canvas in a texture, see unitTokens.ts) and the
 * map legend page (/map-legend) draw exactly the same pixels. The layout
 * constants say how big each layer is next to the disc; MapScene3D sizes its
 * planes from them and the legend stacks its canvases with them.
 */

/** Every token canvas is this square size (px); the dash and edge strips say their own. */
export const TOKEN_ART_SIZE = 128;
export const DASH_ART_SIZE = { width: 64, height: 16 } as const;
export const EDGE_ART_SIZE = { width: 4, height: 32 } as const;
/** The facing marks' plane is this many times the disc's radius, leaving room for the notch outside it. */
export const MARKS_SCALE = 1.5;
/** The token's ring thickness, as a fraction of its radius (about 10% of the diameter). */
const RING_WIDTH = 0.2;
export const CAST_ARC_TEXTURE_STEPS = 48;
export const DEAD_RING = "#5a5a5a";
export const ENEMY_RED = "#ef4444";

export type HaloKind = "selected" | "target" | "targetsTarget" | "pinned";

export const HALO_COLORS: Record<HaloKind, number> = {
  selected: 0xffffff,
  target: 0xff8a3d,
  targetsTarget: 0xb07cff,
  pinned: 0xffd100,
};

/**
 * Token sizes in geometry units, where a player stands PLAYER_GEOMETRY_HEIGHT
 * (3) tall; the plane sizes are half-widths per disc radius.
 */
export const TOKEN_LAYOUT = {
  radius: { player: 1.25, pet: 0.85, hostile: 1.25 },
  bossRadius: 2,
  /** A model's halos and arc sit around this radius. */
  miniRadius: 1.2,
  /** A disc's edge, like a coin's, per radius (about 12% of the diameter). */
  thickness: 0.24,
  plane: { shadow: 1.45, halo: 1.9, pin: 2.25, arc: 1.32, ticks: 1, sigil: 1.5 },
  /** The column above the disc: its width and full height, per radius. */
  columnWidth: 0.26,
  columnHeight: 3.2,
  columnTrackOpacity: 0.08,
  /** The power column beside the health one: thinner and shorter, per radius, and the gap between them. */
  powerColumnWidth: 0.16,
  powerColumnHeight: 2.2,
  columnGap: 0.08,
  /** The boss sigil's tick ring turns this fast (radians per second). */
  sigilSpin: 0.14,
  /** A boss without a model: its hexagon pin stands this high (per radius) over the sigil, this big. */
  bossPinHeight: 1.9,
  bossPinSize: 1.15,
  /** A muted unit (another player is selected) fades to this opacity. */
  mutedOpacity: 0.28,
} as const;

/** Target lines: ribbon widths and dash period (geometry units), and the dashes' speed. */
export const TARGET_LINE = {
  width: 0.32,
  targetsTargetWidth: 0.22,
  dash: 1.6,
  speed: 1.2,
  opacity: 0.9,
  targetsTargetOpacity: 0.75,
} as const;

/** A debuff's dispel type, by the spell's `dispel_type` value (1 magic … 4 poison). */
export type DispelKind = "magic" | "curse" | "disease" | "poison";
export const DISPEL_KINDS: Record<number, DispelKind> = { 1: "magic", 2: "curse", 3: "disease", 4: "poison" };
/** WoW's debuff type colours; a player with several shows the first in this order. */
export const DISPEL_COLORS: Record<DispelKind, string> = {
  magic: "#3399ff",
  curse: "#9900ff",
  disease: "#996600",
  poison: "#009900",
};
export const DISPEL_ORDER: readonly DispelKind[] = ["magic", "curse", "disease", "poison"];
/** The debuff tint's plane, per disc radius (the glow reaches past the ring). */
export const DEBUFF_PLANE = 1.55;

/**
 * Owner lines: a thin line from every guardian (pet, summon, totem) to the
 * player who owns it, in the owner's colour; dim, and bright while the owner
 * or the guardian is selected, targeted or pinned.
 */
export const OWNER_LINE = {
  opacity: 0.85,
  /** The owner's colour is scaled by this for a line nobody is looking at. */
  dim: 0.35,
  /** Height above the floor (geometry units). */
  lift: 0.35,
} as const;

// A small skull, as the design's death marker (12×12 path units).
function drawSkull(context: CanvasRenderingContext2D, centre: number, size: number) {
  context.save();
  context.translate(centre - size / 2, centre - size / 2);
  context.scale(size / 12, size / 12);
  context.fillStyle = "#d4d4d4";
  context.fill(new Path2D("M6 1C3.2 1 1.5 2.9 1.5 5.2c0 1.4.6 2.4 1.5 3V10h1.5V9h1v1h1V9h1v1H9V8.2c.9-.6 1.5-1.6 1.5-3C10.5 2.9 8.8 1 6 1z"));
  context.fillStyle = "#222";
  context.beginPath();
  context.arc(4.2, 5.5, 1.1, 0, Math.PI * 2);
  context.arc(7.8, 5.5, 1.1, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

export interface DiscArt {
  /** The loaded icon, or null (none, or still loading). */
  image: CanvasImageSource | null;
  ring: string;
  dead: boolean;
  /** What fills the disc without an icon: an enemy's dark red well, or a guardian's paw (pets, summons, totems). */
  well: "enemy" | "guardian" | null;
}

// A paw print (one pad, four toes) filling a disc of `radius` around `centre`:
// a guardian's mark, so it never reads as a class or spec icon.
function drawPaw(context: CanvasRenderingContext2D, centre: number, radius: number, color: string) {
  context.fillStyle = color;
  context.beginPath();
  context.ellipse(centre, centre + radius * 0.24, radius * 0.34, radius * 0.28, 0, 0, Math.PI * 2);
  context.fill();
  for (const [dx, dy, size] of [[-0.46, -0.06, 0.14], [-0.17, -0.36, 0.15], [0.17, -0.36, 0.15], [0.46, -0.06, 0.14]]) {
    context.beginPath();
    context.ellipse(centre + dx * radius, centre + dy * radius, size * radius, size * radius * 1.25, dx * 0.6, 0, Math.PI * 2);
    context.fill();
  }
}

/**
 * A token's face: the ring (grey when dead) around the icon (or, without one,
 * an enemy's dark red well or a guardian's paw), with a skull when dead.
 */
export function drawDisc(context: CanvasRenderingContext2D, { image, ring, dead, well }: DiscArt) {
  const size = TOKEN_ART_SIZE;
  const half = size / 2;
  const radius = half - 2;
  const inner = radius * (1 - RING_WIDTH);
  context.clearRect(0, 0, size, size);
  context.beginPath();
  context.arc(half, half, radius, 0, Math.PI * 2);
  context.fillStyle = dead ? DEAD_RING : ring;
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = "#000";
  context.stroke();
  context.save();
  context.beginPath();
  context.arc(half, half, inner, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = "#141414";
  context.fillRect(0, 0, size, size);
  if (image) {
    context.filter = dead ? "grayscale(1) brightness(0.6)" : "none";
    // The square icon, cropped to the circle (icons carry a dark border, so zoom past it).
    const crop = inner * 2.25;
    context.drawImage(image, half - crop / 2, half - crop / 2, crop, crop);
    context.filter = "none";
  } else if (well === "enemy") {
    const gradient = context.createRadialGradient(half, half, 0, half, half, inner);
    gradient.addColorStop(0, dead ? "rgba(90,90,90,.5)" : "rgba(239,68,68,.45)");
    gradient.addColorStop(1, "rgba(20,20,20,1)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  } else if (well === "guardian") {
    drawPaw(context, half, inner * 1.45, dead ? "#8a8a8a" : ring);
  }
  // Inner shade: darker toward the bottom edge, as if lit from above.
  const shade = context.createLinearGradient(0, half - inner, 0, half + inner);
  shade.addColorStop(0.55, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,.45)");
  context.fillStyle = shade;
  context.fillRect(0, 0, size, size);
  if (dead) {
    context.fillStyle = "rgba(0,0,0,.5)";
    context.fillRect(0, 0, size, size);
    drawSkull(context, half, inner * 1.1);
  }
  context.restore();
}

/**
 * The facing marks, on a plane MARKS_SCALE times the disc: a notch at the
 * top edge (the unit faces up the canvas) and, for bosses, three diamonds.
 */
export function drawFacingMarks(context: CanvasRenderingContext2D, color: string, boss: boolean) {
  const half = TOKEN_ART_SIZE / 2;
  const discRadius = half / MARKS_SCALE;
  context.fillStyle = color;
  context.strokeStyle = "rgba(0,0,0,.8)";
  context.lineWidth = 1.5;
  const notchWidth = discRadius * (boss ? 0.32 : 0.48);
  const notchHeight = discRadius * (boss ? 0.5 : 0.42);
  context.beginPath();
  context.moveTo(half, half - discRadius - notchHeight);
  context.lineTo(half + notchWidth, half - discRadius + 2);
  context.lineTo(half - notchWidth, half - discRadius + 2);
  context.closePath();
  context.fill();
  context.stroke();
  if (boss) {
    const diamond = discRadius * 0.14;
    for (const [x, y] of [[half, half + discRadius], [half - discRadius, half], [half + discRadius, half]]) {
      context.beginPath();
      context.moveTo(x, y - diamond);
      context.lineTo(x + diamond, y);
      context.lineTo(x, y + diamond);
      context.lineTo(x - diamond, y);
      context.closePath();
      context.fill();
    }
  }
}

/**
 * A disc's edge strip, wrapped round an open cylinder (top = the face): the
 * ring colour (a tint) shaded from 65% at the face to 35% at the floor.
 */
export function drawEdge(context: CanvasRenderingContext2D) {
  const { width, height } = EDGE_ART_SIZE;
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgb(166,166,166)");
  gradient.addColorStop(1, "rgb(89,89,89)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  // A dark line where the face meets the edge, as the design's outline.
  context.fillStyle = "rgb(20,20,20)";
  context.fillRect(0, 0, width, 2);
}

/** The soft shadow under a token (on a canvas of any square size). */
export function drawShadow(context: CanvasRenderingContext2D, size = 64) {
  const half = size / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, "rgba(0,0,0,.75)");
  gradient.addColorStop(0.55, "rgba(0,0,0,.45)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
}

/**
 * A halo ring in `color` (white when a material tints it): solid for the
 * selected unit and its target, dashed for the target's target, and for
 * pinned units a ring with a diamond marker on its right.
 */
export function drawHalo(context: CanvasRenderingContext2D, kind: HaloKind, color = "#fff") {
  const half = TOKEN_ART_SIZE / 2;
  const radius = half - 10;
  context.strokeStyle = color;
  context.shadowColor = color;
  context.shadowBlur = 8;
  context.lineWidth = kind === "pinned" ? 4 : 5;
  if (kind === "targetsTarget") context.setLineDash([14, 9]);
  context.beginPath();
  context.arc(half, half, radius, 0, Math.PI * 2);
  context.stroke();
  if (kind === "pinned") {
    context.setLineDash([]);
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(half + radius, half - 8);
    context.lineTo(half + radius + 8, half);
    context.lineTo(half + radius, half + 8);
    context.lineTo(half + radius - 8, half);
    context.closePath();
    context.fill();
  }
}

/**
 * A debuffed player's mark, white (tinted by the dispel colour) on a plane
 * DEBUFF_PLANE times the disc: a wash over the icon and a glow round the ring.
 */
export function drawDebuffTint(context: CanvasRenderingContext2D, color = "#fff") {
  const half = TOKEN_ART_SIZE / 2;
  const disc = half / DEBUFF_PLANE;
  context.fillStyle = color;
  context.globalAlpha = 0.32;
  context.beginPath();
  context.arc(half, half, disc * 0.82, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
  context.strokeStyle = color;
  context.shadowColor = color;
  context.shadowBlur = 12;
  context.lineWidth = disc * 0.16;
  context.beginPath();
  context.arc(half, half, disc * 1.04, 0, Math.PI * 2);
  context.stroke();
}

/** The cast arc `fraction` of the way round from the top, clockwise, over a faint track, in `color`. */
export function drawCastArc(context: CanvasRenderingContext2D, fraction: number, color = "#fff") {
  const half = TOKEN_ART_SIZE / 2;
  const radius = half - 6;
  context.lineWidth = 9;
  context.strokeStyle = "rgba(255,255,255,.12)";
  context.beginPath();
  context.arc(half, half, radius, 0, Math.PI * 2);
  context.stroke();
  if (fraction > 0) {
    context.strokeStyle = color;
    context.beginPath();
    context.arc(half, half, radius, -Math.PI / 2, -Math.PI / 2 + fraction * Math.PI * 2);
    context.stroke();
  }
}

/** The boss sigil's still part: an enemy-red ring with a glow over a faint red well. */
export function drawSigil(context: CanvasRenderingContext2D) {
  const size = TOKEN_ART_SIZE;
  const half = size / 2;
  const radius = half * 0.66;
  const well = context.createRadialGradient(half, half, 0, half, half, radius);
  well.addColorStop(0, "rgba(239,68,68,.28)");
  well.addColorStop(0.75, "rgba(239,68,68,.08)");
  well.addColorStop(1, "rgba(239,68,68,0)");
  context.fillStyle = well;
  context.fillRect(0, 0, size, size);
  context.strokeStyle = ENEMY_RED;
  context.shadowColor = "rgba(239,68,68,.8)";
  context.shadowBlur = 10;
  context.lineWidth = 3;
  context.beginPath();
  context.arc(half, half, radius, 0, Math.PI * 2);
  context.stroke();
}

/** The boss sigil's slowly turning tick ring. */
export function drawSigilTicks(context: CanvasRenderingContext2D) {
  const half = TOKEN_ART_SIZE / 2;
  context.fillStyle = "rgba(239,68,68,.85)";
  for (let degrees = 0; degrees < 360; degrees += 15) {
    const from = (degrees * Math.PI) / 180;
    const to = ((degrees + 5) * Math.PI) / 180;
    context.beginPath();
    context.arc(half, half, half - 1, from, to);
    context.arc(half, half, half * 0.84, to, from, true);
    context.closePath();
    context.fill();
  }
}

/** A boss without a model: a hexagon in enemy red with a skull, standing over its sigil. */
export function drawBossPin(context: CanvasRenderingContext2D) {
  const size = TOKEN_ART_SIZE;
  const hexagon = (inset: number) => {
    const points = [[0.25, 0.03], [0.75, 0.03], [1, 0.5], [0.75, 0.97], [0.25, 0.97], [0, 0.5]];
    context.beginPath();
    points.forEach(([x, y], index) => {
      const px = inset + x * (size - inset * 2);
      const py = inset + y * (size - inset * 2);
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    });
    context.closePath();
  };
  hexagon(2);
  context.fillStyle = ENEMY_RED;
  context.fill();
  hexagon(10);
  context.fillStyle = "#141414";
  context.fill();
  drawSkull(context, size / 2, size * 0.5);
}

/**
 * One period of a target line's dash (it repeats along the line), in
 * `color`: long dashes for the selected unit's line, dots for the target's target.
 */
export function drawDash(context: CanvasRenderingContext2D, dotted: boolean, color = "#fff") {
  context.fillStyle = color;
  const length = dotted ? 16 : 36;
  context.beginPath();
  context.roundRect(4, 3, length, 10, 5);
  context.fill();
}
