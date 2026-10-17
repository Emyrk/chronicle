import * as THREE from "three";

/**
 * Canvas textures for the 3D map's unit tokens: flat ground discs (class
 * ring around the class icon), their facing notch, halos, cast arcs, the
 * boss sigil and the dashed target lines. Drawn white where a material tints
 * them, cached by what they show, and redrawn when an icon loads.
 */

const SIZE = 128;
/** The facing marks' plane is this many times the disc's radius, leaving room for the notch outside it. */
export const MARKS_SCALE = 1.5;
/** The token's ring thickness, as a fraction of its radius (about 10% of the diameter). */
const RING_WIDTH = 0.2;
export const CAST_ARC_TEXTURE_STEPS = 48;

export type HaloKind = "selected" | "target" | "targetsTarget" | "pinned";

export const HALO_COLORS: Record<HaloKind, number> = {
  selected: 0xffffff,
  target: 0xff8a3d,
  targetsTarget: 0xb07cff,
  pinned: 0xffd100,
};

const DEAD_RING = "#5a5a5a";

function canvas(width = SIZE, height = width): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  return [element, element.getContext("2d")!];
}

function texture(element: HTMLCanvasElement): THREE.CanvasTexture {
  const result = new THREE.CanvasTexture(element);
  result.colorSpace = THREE.SRGBColorSpace;
  return result;
}

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

export class UnitTokenTextures {
  private readonly images = new Map<string, HTMLImageElement | "loading" | "failed">();
  private readonly discs = new Map<string, { texture: THREE.CanvasTexture; context: CanvasRenderingContext2D; icon: string | null; ring: string; dead: boolean; enemy: boolean; drawn: boolean }>();
  private readonly marks = new Map<string, THREE.CanvasTexture>();
  private readonly halos = new Map<HaloKind, THREE.CanvasTexture>();
  private readonly arcs: (THREE.CanvasTexture | undefined)[] = [];
  private shadowTexture: THREE.CanvasTexture | null = null;
  private sigilTexture: THREE.CanvasTexture | null = null;
  private ticksTexture: THREE.CanvasTexture | null = null;
  private pinTexture: THREE.CanvasTexture | null = null;
  private edgeTexture: THREE.CanvasTexture | null = null;
  private readonly dashes = new Map<string, THREE.CanvasTexture>();

  private readonly onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
  }

  private image(url: string): HTMLImageElement | null {
    const cached = this.images.get(url);
    if (cached instanceof HTMLImageElement) return cached;
    if (cached) return null;
    this.images.set(url, "loading");
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      this.images.set(url, image);
      for (const disc of this.discs.values()) {
        if (disc.icon === url && !disc.drawn) this.drawDisc(disc);
      }
      this.onChange();
    };
    image.onerror = () => this.images.set(url, "failed");
    image.src = url;
    return null;
  }

  /**
   * A token's face: the class-coloured ring (grey when dead) around the icon
   * (or, for enemies without one, a dark red well), with a skull when dead.
   */
  disc(icon: string | null, ring: string, dead: boolean, enemy: boolean): THREE.CanvasTexture {
    const key = `${icon}|${ring}|${dead}|${enemy}`;
    let disc = this.discs.get(key);
    if (!disc) {
      const [element, context] = canvas();
      disc = { texture: texture(element), context, icon, ring, dead, enemy, drawn: false };
      this.discs.set(key, disc);
      this.drawDisc(disc);
    }
    return disc.texture;
  }

  private drawDisc(disc: { texture: THREE.CanvasTexture; context: CanvasRenderingContext2D; icon: string | null; ring: string; dead: boolean; enemy: boolean; drawn: boolean }) {
    const context = disc.context;
    const half = SIZE / 2;
    const radius = half - 2;
    const inner = radius * (1 - RING_WIDTH);
    context.clearRect(0, 0, SIZE, SIZE);
    context.beginPath();
    context.arc(half, half, radius, 0, Math.PI * 2);
    context.fillStyle = disc.dead ? DEAD_RING : disc.ring;
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = "#000";
    context.stroke();
    context.save();
    context.beginPath();
    context.arc(half, half, inner, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = "#141414";
    context.fillRect(0, 0, SIZE, SIZE);
    const image = disc.icon ? this.image(disc.icon) : null;
    if (image) {
      context.filter = disc.dead ? "grayscale(1) brightness(0.6)" : "none";
      // The square icon, cropped to the circle (icons carry a dark border, so zoom past it).
      const crop = inner * 2.25;
      context.drawImage(image, half - crop / 2, half - crop / 2, crop, crop);
      context.filter = "none";
    } else if (disc.enemy) {
      const well = context.createRadialGradient(half, half, 0, half, half, inner);
      well.addColorStop(0, disc.dead ? "rgba(90,90,90,.5)" : "rgba(239,68,68,.45)");
      well.addColorStop(1, "rgba(20,20,20,1)");
      context.fillStyle = well;
      context.fillRect(0, 0, SIZE, SIZE);
    }
    // Inner shade: darker toward the bottom edge, as if lit from above.
    const shade = context.createLinearGradient(0, half - inner, 0, half + inner);
    shade.addColorStop(0.55, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,0,0,.45)");
    context.fillStyle = shade;
    context.fillRect(0, 0, SIZE, SIZE);
    if (disc.dead) {
      context.fillStyle = "rgba(0,0,0,.5)";
      context.fillRect(0, 0, SIZE, SIZE);
      drawSkull(context, half, inner * 1.1);
    }
    context.restore();
    disc.drawn = !disc.icon || image !== null;
    disc.texture.needsUpdate = true;
  }

  /**
   * The facing marks, on a plane MARKS_SCALE times the disc: a notch at the
   * top edge (the unit faces up the texture) and, for bosses, three diamonds.
   */
  facingMarks(color: string, boss: boolean): THREE.CanvasTexture {
    const key = `${color}|${boss}`;
    let result = this.marks.get(key);
    if (!result) {
      const [element, context] = canvas();
      const half = SIZE / 2;
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
      result = texture(element);
      this.marks.set(key, result);
    }
    return result;
  }

  /**
   * A disc's edge, wrapped round an open cylinder (v = 1 at the face): the
   * ring colour (the material's) shaded from 65% at the face to 35% at the floor.
   */
  edge(): THREE.CanvasTexture {
    if (!this.edgeTexture) {
      const [element, context] = canvas(4, 32);
      const gradient = context.createLinearGradient(0, 0, 0, 32);
      gradient.addColorStop(0, "rgb(166,166,166)");
      gradient.addColorStop(1, "rgb(89,89,89)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 4, 32);
      // A dark line where the face meets the edge, as the design's outline.
      context.fillStyle = "rgb(20,20,20)";
      context.fillRect(0, 0, 4, 2);
      this.edgeTexture = texture(element);
    }
    return this.edgeTexture;
  }

  /** The soft shadow under a token. */
  shadow(): THREE.CanvasTexture {
    if (!this.shadowTexture) {
      const [element, context] = canvas(64);
      const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, "rgba(0,0,0,.75)");
      gradient.addColorStop(0.55, "rgba(0,0,0,.45)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 64, 64);
      this.shadowTexture = texture(element);
    }
    return this.shadowTexture;
  }

  /**
   * A halo ring, white (the material tints it): solid for the selected unit
   * and its target, dashed for the target's target, and for pinned units a
   * ring with a diamond marker on its right.
   */
  halo(kind: HaloKind): THREE.CanvasTexture {
    let result = this.halos.get(kind);
    if (!result) {
      const [element, context] = canvas();
      const half = SIZE / 2;
      const radius = half - 10;
      context.strokeStyle = "#fff";
      context.shadowColor = "#fff";
      context.shadowBlur = 8;
      context.lineWidth = kind === "pinned" ? 4 : 5;
      if (kind === "targetsTarget") context.setLineDash([14, 9]);
      context.beginPath();
      context.arc(half, half, radius, 0, Math.PI * 2);
      context.stroke();
      if (kind === "pinned") {
        context.setLineDash([]);
        context.fillStyle = "#fff";
        context.beginPath();
        context.moveTo(half + radius, half - 8);
        context.lineTo(half + radius + 8, half);
        context.lineTo(half + radius, half + 8);
        context.lineTo(half + radius - 8, half);
        context.closePath();
        context.fill();
      }
      result = texture(element);
      this.halos.set(kind, result);
    }
    return result;
  }

  /** The cast arc `step / CAST_ARC_TEXTURE_STEPS` of the way round from the top, clockwise, over a faint track. */
  castArc(step: number): THREE.CanvasTexture {
    let result = this.arcs[step];
    if (!result) {
      const [element, context] = canvas();
      const half = SIZE / 2;
      const radius = half - 6;
      context.lineWidth = 9;
      context.strokeStyle = "rgba(255,255,255,.12)";
      context.beginPath();
      context.arc(half, half, radius, 0, Math.PI * 2);
      context.stroke();
      if (step > 0) {
        context.strokeStyle = "#fff";
        context.beginPath();
        context.arc(half, half, radius, -Math.PI / 2, -Math.PI / 2 + (step / CAST_ARC_TEXTURE_STEPS) * Math.PI * 2);
        context.stroke();
      }
      result = texture(element);
      this.arcs[step] = result;
    }
    return result;
  }

  /** The boss sigil's still part: an enemy-red ring with a glow over a faint red well. */
  sigil(): THREE.CanvasTexture {
    if (!this.sigilTexture) {
      const [element, context] = canvas();
      const half = SIZE / 2;
      const radius = half * 0.66;
      const well = context.createRadialGradient(half, half, 0, half, half, radius);
      well.addColorStop(0, "rgba(239,68,68,.28)");
      well.addColorStop(0.75, "rgba(239,68,68,.08)");
      well.addColorStop(1, "rgba(239,68,68,0)");
      context.fillStyle = well;
      context.fillRect(0, 0, SIZE, SIZE);
      context.strokeStyle = "#ef4444";
      context.shadowColor = "rgba(239,68,68,.8)";
      context.shadowBlur = 10;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(half, half, radius, 0, Math.PI * 2);
      context.stroke();
      this.sigilTexture = texture(element);
    }
    return this.sigilTexture;
  }

  /** The boss sigil's slowly turning tick ring. */
  sigilTicks(): THREE.CanvasTexture {
    if (!this.ticksTexture) {
      const [element, context] = canvas();
      const half = SIZE / 2;
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
      this.ticksTexture = texture(element);
    }
    return this.ticksTexture;
  }

  /** A boss without a model: a hexagon in enemy red with a skull, standing over its sigil. */
  bossPin(): THREE.CanvasTexture {
    if (!this.pinTexture) {
      const [element, context] = canvas();
      const hexagon = (inset: number) => {
        const points = [[0.25, 0.03], [0.75, 0.03], [1, 0.5], [0.75, 0.97], [0.25, 0.97], [0, 0.5]];
        context.beginPath();
        points.forEach(([x, y], index) => {
          const px = inset + x * (SIZE - inset * 2);
          const py = inset + y * (SIZE - inset * 2);
          if (index === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        });
        context.closePath();
      };
      hexagon(2);
      context.fillStyle = "#ef4444";
      context.fill();
      hexagon(10);
      context.fillStyle = "#141414";
      context.fill();
      drawSkull(context, SIZE / 2, SIZE * 0.5);
      this.pinTexture = texture(element);
    }
    return this.pinTexture;
  }

  /**
   * A repeating dash for target lines (one period per texture width), white:
   * long dashes for the selected unit's line, dots for the target's target.
   */
  dash(dotted: boolean): THREE.CanvasTexture {
    const key = String(dotted);
    let result = this.dashes.get(key);
    if (!result) {
      const [element, context] = canvas(64, 16);
      context.fillStyle = "#fff";
      const length = dotted ? 16 : 36;
      context.beginPath();
      context.roundRect(4, 3, length, 10, 5);
      context.fill();
      result = texture(element);
      result.wrapS = THREE.RepeatWrapping;
      this.dashes.set(key, result);
    }
    return result;
  }

  dispose() {
    for (const disc of this.discs.values()) disc.texture.dispose();
    for (const mark of this.marks.values()) mark.dispose();
    for (const halo of this.halos.values()) halo.dispose();
    for (const arc of this.arcs) arc?.dispose();
    for (const dash of this.dashes.values()) dash.dispose();
    this.shadowTexture?.dispose();
    this.sigilTexture?.dispose();
    this.ticksTexture?.dispose();
    this.pinTexture?.dispose();
    this.edgeTexture?.dispose();
    this.discs.clear();
    this.marks.clear();
    this.halos.clear();
    this.dashes.clear();
  }
}
