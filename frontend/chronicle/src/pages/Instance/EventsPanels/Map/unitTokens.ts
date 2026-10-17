import * as THREE from "three";
import {
  CAST_ARC_TEXTURE_STEPS,
  DASH_ART_SIZE,
  EDGE_ART_SIZE,
  TOKEN_ART_SIZE,
  drawBossPin,
  drawCastArc,
  drawDash,
  drawDisc,
  drawEdge,
  drawFacingMarks,
  drawHalo,
  drawShadow,
  drawSigil,
  drawSigilTicks,
  type HaloKind,
} from "./unitTokenArt";

/**
 * Canvas textures for the 3D map's unit tokens, drawn by unitTokenArt (which
 * the map legend page draws with too): white where a material tints them,
 * cached by what they show, and redrawn when an icon loads.
 */

function canvas(width = TOKEN_ART_SIZE, height = width): [HTMLCanvasElement, CanvasRenderingContext2D] {
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

// Draws once into a fresh canvas and wraps it.
function drawn(draw: (context: CanvasRenderingContext2D) => void, width?: number, height?: number): THREE.CanvasTexture {
  const [element, context] = canvas(width, height);
  draw(context);
  return texture(element);
}

interface DiscEntry {
  texture: THREE.CanvasTexture;
  context: CanvasRenderingContext2D;
  icon: string | null;
  ring: string;
  dead: boolean;
  enemy: boolean;
  drawn: boolean;
}

export class UnitTokenTextures {
  private readonly images = new Map<string, HTMLImageElement | "loading" | "failed">();
  private readonly discs = new Map<string, DiscEntry>();
  private readonly marks = new Map<string, THREE.CanvasTexture>();
  private readonly halos = new Map<HaloKind, THREE.CanvasTexture>();
  private readonly arcs: (THREE.CanvasTexture | undefined)[] = [];
  private readonly dashes = new Map<string, THREE.CanvasTexture>();
  private readonly singles = new Map<string, THREE.CanvasTexture>();
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

  // One texture per kind of art that never changes.
  private single(key: string, draw: (context: CanvasRenderingContext2D) => void, width?: number, height?: number): THREE.CanvasTexture {
    let result = this.singles.get(key);
    if (!result) {
      result = drawn(draw, width, height);
      this.singles.set(key, result);
    }
    return result;
  }

  /** A token's face (see drawDisc), redrawn once its icon loads. */
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

  private drawDisc(disc: DiscEntry) {
    const image = disc.icon ? this.image(disc.icon) : null;
    drawDisc(disc.context, { image, ring: disc.ring, dead: disc.dead, enemy: disc.enemy });
    disc.drawn = !disc.icon || image !== null;
    disc.texture.needsUpdate = true;
  }

  facingMarks(color: string, boss: boolean): THREE.CanvasTexture {
    const key = `${color}|${boss}`;
    let result = this.marks.get(key);
    if (!result) {
      result = drawn((context) => drawFacingMarks(context, color, boss));
      this.marks.set(key, result);
    }
    return result;
  }

  edge(): THREE.CanvasTexture {
    return this.single("edge", drawEdge, EDGE_ART_SIZE.width, EDGE_ART_SIZE.height);
  }

  shadow(): THREE.CanvasTexture {
    return this.single("shadow", (context) => drawShadow(context), 64);
  }

  halo(kind: HaloKind): THREE.CanvasTexture {
    let result = this.halos.get(kind);
    if (!result) {
      result = drawn((context) => drawHalo(context, kind));
      this.halos.set(kind, result);
    }
    return result;
  }

  /** The cast arc `step / CAST_ARC_TEXTURE_STEPS` of the way round. */
  castArc(step: number): THREE.CanvasTexture {
    let result = this.arcs[step];
    if (!result) {
      result = drawn((context) => drawCastArc(context, step / CAST_ARC_TEXTURE_STEPS));
      this.arcs[step] = result;
    }
    return result;
  }

  sigil(): THREE.CanvasTexture {
    return this.single("sigil", drawSigil);
  }

  sigilTicks(): THREE.CanvasTexture {
    return this.single("ticks", drawSigilTicks);
  }

  bossPin(): THREE.CanvasTexture {
    return this.single("pin", drawBossPin);
  }

  /** A target line's repeating dash (dots for the target's target). */
  dash(dotted: boolean): THREE.CanvasTexture {
    const key = String(dotted);
    let result = this.dashes.get(key);
    if (!result) {
      result = drawn((context) => drawDash(context, dotted), DASH_ART_SIZE.width, DASH_ART_SIZE.height);
      result.wrapS = THREE.RepeatWrapping;
      this.dashes.set(key, result);
    }
    return result;
  }

  dispose() {
    for (const disc of this.discs.values()) disc.texture.dispose();
    for (const textures of [this.marks, this.halos, this.dashes, this.singles]) {
      for (const each of textures.values()) each.dispose();
      textures.clear();
    }
    for (const arc of this.arcs) arc?.dispose();
    this.discs.clear();
  }
}
