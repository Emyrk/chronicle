/**
 * The HUD layer of MapScene3D (chronicle-1977): health bars, nameplates,
 * cast icons and combat text over the units, and the compass yaw. Cast icons
 * and combat text are stepped by the effects pass (EffectsHud); bars,
 * plates and the compass by the frame. Reads units through HudUnits and the
 * effect state through HudEffects. Moved verbatim out of MapScene3D.ts.
 */
import * as THREE from "three";
import { unwrapCompassRadians } from "./mapCompassModel";
import { drawUnitPlate, ENEMY_RED, UNIT_PLATE, unitPlateSize, type UnitPlateInfo } from "./unitTokenArt";
import { BAR_ABSORB, BAR_BACKGROUND, BAR_DEAD, BAR_HEAL, CAST_ARC_OPACITY, COOLDOWN_ICON_COLOR, COOLDOWN_ICON_SCALE, INTERRUPT_LABEL_COLOR } from "./mapPalette";
import {
  corsTextureUrl,
} from "./dungeonMeshes";
import { healthBarColor, MAX_HEALTH_BARS, MAX_PLAYER_HEALTH_BARS, PLAYER_BAR_SCALE } from "./mapModel";
import {
  deriveCastIcons,
  deriveCombatText,
  deriveRecentHealGain,
  INTERRUPTED_ICON_MS,
  INTERRUPTED_PLAYER_ICON_MS,
  type CastIcon,
  type CombatText,
  type DeriveEffectsOptions,
  type EncounterEffects,
  type UnitCast,
} from "./replayEffects";
import { CAST_ARC_SIZE, createArcTexture, createIconMaterial, createTextTexture, easeOutBack, easeOutCubic, shortNumber } from "./sceneFactories";
import type { MapScene3DEffects, MapUnitRoles } from "./MapScene3D";
import type { UnitObject } from "./unitLayer";
import { commitPool, createPool } from "./sceneFactories";
import { BAR_HEIGHT, MAX_CAST_ICONS } from "./sceneConstants";

// The hovered unit's nameplate is this many screen pixels per canvas pixel (at 1x),
// at every zoom: about 135 px wide.
const PLATE_SCREEN_SCALE = 0.8;
const BAR_WIDTH = 2.6;
const BAR_THICKNESS = 0.36;
const BAR_PADDING = 0.14;
// The power strip under the health bar, and the gap between them.
const POWER_STRIP_THICKNESS = 0.16;
const POWER_STRIP_GAP = 0.05;
// Quads per bar: backing, health, healed, absorb, power.
const BAR_QUADS = 5;
const BAR_POOL_SIZE = (MAX_HEALTH_BARS + MAX_PLAYER_HEALTH_BARS) * BAR_QUADS;
const MAX_COMBAT_TEXT = 8;
const COMBAT_TEXT_HEIGHT = 1.8;
// Rendered label textures kept for reuse (spell name + colour).
const MAX_LABEL_TEXTURES = 128;
// About 26 px at the constant on-screen size.
const CAST_ICON_SIZE = 2.6;
// Gap between a caster's health bar and the bottom of its icons.
const CAST_ICON_BAR_GAP = 0.55;
// Gap above the icons for combat text and the hover label.
const CAST_ICON_TOP_GAP = 0.3;
// Above this many icons, all draw at CAST_ICON_CROWDED_SCALE.
const CAST_ICON_CROWDED = 8;
const CAST_ICON_CROWDED_SCALE = 0.8;
// A cast grows in from CAST_ICON_GROW_FROM over this long (replay time).
const CAST_ICON_GROW_MS = 150;
const CAST_ICON_GROW_FROM = 0.75;
// A cast going off pops to CAST_ICON_POP_SCALE and back over this long.
const CAST_ICON_POP_MS = 180;
const CAST_ICON_POP_SCALE = 1.35;
// A white ring flashes around the icon as the cast goes off.
const CAST_ICON_FLASH_MS = 120;
// An interrupted icon (times from the interrupt): a quick impact bump, drains
// to grey and dims, wiggles 3 times by up to +-8 degrees (decaying), then
// fades and shrinks over its last INTERRUPT_FADE_MS. Enemies also float
// "Interrupted" above the icon.
const INTERRUPT_IMPACT_MS = 80;
const INTERRUPT_IMPACT_SCALE = 1.15;
const INTERRUPT_GREY_MS = 150;
const INTERRUPT_BRIGHTNESS = 0.7;
const INTERRUPT_WIGGLE_MS = 240;
const INTERRUPT_WIGGLE = (8 * Math.PI) / 180;
const INTERRUPT_FADE_MS = 300;
const INTERRUPT_SHRINK = 0.85;
const INTERRUPT_LABEL_MS = 550;
const INTERRUPT_LABEL_HEIGHT = 1.6;
// The cast progress outline around an icon, in 5 % steps.
const CAST_ARC_STEPS = 20;
// Loaded icon textures kept for reuse, keyed by URL.
const MAX_ICON_TEXTURES = 128;
// A failed icon load is retried after this long (real time).
const ICON_RETRY_MS = 30_000;

/** What the HUD reads from the units. */
export interface HudUnits {
  readonly units: ReadonlyMap<string, UnitObject>;
  readonly roles: MapUnitRoles;
  scaleOf(object: UnitObject): number;
}

/** What the HUD reads from the effects pass. */
export interface HudEffects {
  readonly effects: MapScene3DEffects | null;
  readonly effectOptions: DeriveEffectsOptions;
  readonly effectCursorMs: number;
  readonly unitCasts: ReadonlyMap<string, UnitCast>;
  castColor(cast: UnitCast): THREE.Color;
}

/** What the HUD layer needs from the scene. */
export interface HudLayerHost {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  textureLoader: THREE.TextureLoader;
  /** The scene's shared scratch (the same instances the units and the effects use). */
  scratch: { color: THREE.Color; matrix: THREE.Matrix4; scaleVector: THREE.Vector3; vector: THREE.Vector3; vectorB: THREE.Vector3; vectorC: THREE.Vector3 };
  units: HudUnits;
  effects: HudEffects;
  now: () => number;
  requestRender: () => void;
  onCompassYaw: (yaw: number) => void;
  cameraYaw: () => number;
  disposed: () => boolean;
  hoveredGuid: () => string | null;
  unitScale: () => number;
}

export class HudLayer {
  // From the host, under the names the moved code uses.
  private readonly host: HudLayerHost;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly textureLoader: THREE.TextureLoader;
  private readonly color: THREE.Color;
  private readonly matrix: THREE.Matrix4;
  private readonly scaleVector: THREE.Vector3;
  private readonly vector: THREE.Vector3;
  private readonly vectorB: THREE.Vector3;
  private readonly vectorC: THREE.Vector3;
  private readonly now: () => number;
  private readonly requestRender: () => void;
  private readonly cameraYaw: () => number;
  // Nameplates (drawUnitPlate) over the hovered unit, the selected unit, its
  // target, their target and pinned units; each redrawn when what it shows changes.
  private readonly plates = new Map<string, { sprite: THREE.Sprite; canvas: HTMLCanvasElement; key: string }>();
  // Background, fill, heal chunk and absorb quads per bar.
  private readonly bars: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly combatText: CombatText[] = [];
  private readonly combatSprites: THREE.Sprite[] = [];
  private readonly labelTextures = new Map<string, { texture: THREE.CanvasTexture; aspect: number }>();
  readonly castIcons: CastIcon[] = [];
  readonly castSprites: THREE.Sprite[] = [];
  // Progress outlines and go flashes, one per icon sprite.
  private readonly castArcs: THREE.Sprite[] = [];
  // "Interrupted" labels, one per icon sprite.
  private readonly castLabels: THREE.Sprite[] = [];
  // Outline textures by step (index CAST_ARC_STEPS is the full ring), made on
  // first use; cut outlines (grey, red tick) likewise.
  private readonly arcTextures: (THREE.CanvasTexture | undefined)[] = [];
  private readonly cutArcTextures: (THREE.CanvasTexture | undefined)[] = [];
  // Index into castIcons of each shown icon sprite, for hover picking.
  readonly castSpriteIcons = new Int16Array(MAX_CAST_ICONS);
  // Top of each caster's icons (unscaled height), for text and the hover label.
  private readonly castIconTops = new Map<string, number>();
  readonly castIconCast = { caster: "", spellId: 0, spellName: "", phase: "casting" as CastIcon["phase"] };
  // Icon textures by URL, in least-recently-used order; a number is the time a load failed.
  readonly iconTextures = new Map<string, THREE.Texture | "loading" | number>();
  private readonly onCompassYaw: (yaw: number) => void;
  private lastCompassYaw = Number.NaN;

  constructor(host: HudLayerHost) {
    this.host = host;
    this.scene = host.scene;
    this.camera = host.camera;
    this.renderer = host.renderer;
    this.textureLoader = host.textureLoader;
    this.color = host.scratch.color;
    this.matrix = host.scratch.matrix;
    this.scaleVector = host.scratch.scaleVector;
    this.vector = host.scratch.vector;
    this.vectorB = host.scratch.vectorB;
    this.vectorC = host.scratch.vectorC;
    this.now = host.now;
    this.requestRender = host.requestRender;
    this.onCompassYaw = host.onCompassYaw;
    this.cameraYaw = host.cameraYaw;
    // Health bars: camera-facing quads drawn over everything, in instance order.
    this.bars = createPool(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.92, depthTest: false, depthWrite: false }),
      BAR_POOL_SIZE,
      this.color,
    );
    this.bars.renderOrder = 9;
    this.scene.add(this.bars);
    for (let index = 0; index < MAX_COMBAT_TEXT; index++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
      sprite.center.set(0.5, 0);
      sprite.renderOrder = 10;
      sprite.visible = false;
      this.combatSprites.push(sprite);
      this.scene.add(sprite);
    }
    for (let index = 0; index < MAX_CAST_ICONS; index++) {
      const sprite = new THREE.Sprite(createIconMaterial());
      sprite.renderOrder = 11;
      sprite.visible = false;
      this.castSprites.push(sprite);
      const arc = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, depthWrite: false, transparent: true }));
      arc.renderOrder = 12;
      arc.visible = false;
      this.castArcs.push(arc);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
      label.center.set(0.5, 0);
      label.renderOrder = 12;
      label.visible = false;
      this.castLabels.push(label);
      this.scene.add(sprite, arc, label);
    }
  }

  private get units(): ReadonlyMap<string, UnitObject> {
    return this.host.units.units;
  }
  private get roles(): MapUnitRoles {
    return this.host.units.roles;
  }
  private scaleOf(object: UnitObject): number {
    return this.host.units.scaleOf(object);
  }
  private get effects(): MapScene3DEffects | null {
    return this.host.effects.effects;
  }
  private get effectOptions(): DeriveEffectsOptions {
    return this.host.effects.effectOptions;
  }
  private get effectCursorMs(): number {
    return this.host.effects.effectCursorMs;
  }
  private get unitCasts(): ReadonlyMap<string, UnitCast> {
    return this.host.effects.unitCasts;
  }
  private castColor(cast: UnitCast): THREE.Color {
    return this.host.effects.castColor(cast);
  }
  private get disposed(): boolean {
    return this.host.disposed();
  }
  private get hoveredGuid(): string | null {
    return this.host.hoveredGuid();
  }
  private get unitScale(): number {
    return this.host.unitScale();
  }

  emitCompassYaw() {
    const yaw = unwrapCompassRadians(this.lastCompassYaw, this.cameraYaw());
    if (Number.isFinite(this.lastCompassYaw) && Math.abs(yaw - this.lastCompassYaw) < Math.PI / 360) return;
    this.lastCompassYaw = yaw;
    this.onCompassYaw(yaw);
  }

  updateCombatText(fx: EncounterEffects | null, cursorMs: number) {
    const sources = this.effects?.combatTextGuids ?? null;
    const healGuids = this.effects?.healTextGuids ?? null;
    const any = Boolean(fx && ((sources && sources.size > 0) || (healGuids && healGuids.size > 0)));
    const texts = any
      ? deriveCombatText(fx!, cursorMs, sources, healGuids, this.effects?.suppressNameGuids ?? null, this.effectOptions, MAX_COMBAT_TEXT, this.combatText)
      : this.combatText;
    if (!any) texts.length = 0;
    let shown = 0;
    for (const text of texts) {
      const target = this.units.get(text.target);
      if (!target || !target.group.visible) continue;
      const sprite = this.combatSprites[shown];
      const label = this.labelTexture(text.text, this.effects!.resolveColor(text.color), text.crit);
      if (sprite.material.map !== label.texture) {
        sprite.material.map = label.texture;
        sprite.material.needsUpdate = true;
      }
      sprite.material.opacity = 1 - text.progress * text.progress;
      const height = COMBAT_TEXT_HEIGHT * (text.crit ? 1.25 : 1) * this.unitScale;
      sprite.scale.set(height * label.aspect, height, 1);
      // Float up from above the bar (or the unit's cast icons); stagger
      // labels on the same target.
      const iconTop = this.castIconTops.get(text.target);
      const start = iconTop !== undefined ? iconTop + CAST_ICON_TOP_GAP : target.labelHeight + 0.5;
      const lift = (start + 2 * text.progress + (shown % 3) * 1.2) * this.scaleOf(target);
      sprite.position.set(target.base.x, target.base.y + lift, target.base.z);
      sprite.visible = true;
      shown++;
    }
    for (let index = shown; index < MAX_COMBAT_TEXT; index++) this.combatSprites[index].visible = false;
  }

  updateCastIcons(fx: EncounterEffects | null, cursorMs: number) {
    const castIcons = this.effects?.castIcons;
    const on = Boolean(fx && castIcons && castIcons.guids.size > 0);
    const icons = on
      ? deriveCastIcons(fx!, cursorMs, castIcons!.guids, Math.min(MAX_CAST_ICONS, this.effectOptions.maxEffects), this.castIcons, {
        priorityGuids: castIcons!.priorityGuids,
        enemyGuids: castIcons!.enemyGuids,
        filterGuids: this.effectOptions.filterGuids,
        isProc: castIcons!.isProc,
        isCooldown: castIcons!.isCooldown,
      })
      : this.castIcons;
    if (!on) icons.length = 0;
    const right = this.vectorB.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    let visible = 0;
    for (const icon of icons) {
      if (this.units.get(icon.caster)?.group.visible) visible++;
    }
    const baseSize = CAST_ICON_SIZE * (visible > CAST_ICON_CROWDED ? CAST_ICON_CROWDED_SCALE : 1);
    this.castIconTops.clear();
    // Every pooled sprite starts each frame in colour, upright and untinted,
    // so scrubbing back before an interrupt shows the colour icon again.
    for (const sprite of this.castSprites) {
      sprite.material.userData.saturation.value = 1;
      sprite.material.rotation = 0;
      sprite.material.color.setHex(0xffffff);
    }
    let shown = 0;
    for (let index = 0; index < icons.length; index++) {
      const icon = icons[index];
      const caster = this.units.get(icon.caster);
      if (!caster || !caster.group.visible) continue;
      // The question mark stands in while the icon loads or after it failed.
      const texture = this.iconTexture(castIcons!.iconUrl(icon.spellId)) ?? this.iconTexture(castIcons!.placeholderUrl);
      if (!texture) continue;
      const sprite = this.castSprites[shown];
      const arc = this.castArcs[shown];
      const material = sprite.material;
      if (material.map !== texture) {
        material.map = texture;
        material.needsUpdate = true;
      }
      let scale = 1;
      let opacity = 1;
      let rotation = 0;
      let arcTexture: THREE.CanvasTexture | null = null;
      let arcOpacity = 0;
      let flash = false;
      let label = false;
      if (icon.phase === "casting") {
        // Grows in, then holds while the outline sweeps round with the cast.
        scale = icon.elapsedMs < CAST_ICON_GROW_MS
          ? CAST_ICON_GROW_FROM + (1 - CAST_ICON_GROW_FROM) * easeOutCubic(icon.elapsedMs / CAST_ICON_GROW_MS)
          : 1;
        const step = Math.floor(icon.progress * CAST_ARC_STEPS);
        if (step > 0) {
          arcTexture = this.arcTexture(step, false);
          arcOpacity = CAST_ARC_OPACITY;
        }
      } else if (icon.phase === "instant") {
        // Pops as the cast goes off with a white ring flash, then fades.
        const pop = icon.elapsedMs / CAST_ICON_POP_MS;
        if (pop < 0.35) scale = 1 + (CAST_ICON_POP_SCALE - 1) * easeOutCubic(pop / 0.35);
        else if (pop < 1) scale = CAST_ICON_POP_SCALE - (CAST_ICON_POP_SCALE - 1) * easeOutBack((pop - 0.35) / 0.65, 1.7);
        opacity = 1 - icon.progress * icon.progress;
        if (icon.elapsedMs < CAST_ICON_FLASH_MS) {
          arcTexture = this.arcTexture(CAST_ARC_STEPS, false);
          arcOpacity = 1 - icon.elapsedMs / CAST_ICON_FLASH_MS;
          flash = true;
        }
      } else {
        // Interrupted: the icon bumps, drains to grey and wiggles; the
        // outline freezes where the cast was cut, then everything fades.
        const elapsed = icon.elapsedMs;
        const lingerMs = icon.enemy ? INTERRUPTED_ICON_MS : INTERRUPTED_PLAYER_ICON_MS;
        if (elapsed < INTERRUPT_IMPACT_MS) {
          const impact = elapsed / INTERRUPT_IMPACT_MS;
          scale = impact < 0.5
            ? 1 + (INTERRUPT_IMPACT_SCALE - 1) * easeOutCubic(impact / 0.5)
            : INTERRUPT_IMPACT_SCALE - (INTERRUPT_IMPACT_SCALE - 1) * easeOutBack((impact - 0.5) / 0.5, 1.7);
        }
        const grey = 1 - (1 - Math.min(1, elapsed / INTERRUPT_GREY_MS)) ** 2;
        material.userData.saturation.value = 1 - grey;
        material.color.setScalar(1 - (1 - INTERRUPT_BRIGHTNESS) * grey);
        if (elapsed < INTERRUPT_WIGGLE_MS) {
          const wiggle = elapsed / INTERRUPT_WIGGLE_MS;
          rotation = Math.sin(wiggle * Math.PI * 6) * INTERRUPT_WIGGLE * (1 - wiggle);
        }
        const fadeFrom = lingerMs - INTERRUPT_FADE_MS;
        if (elapsed > fadeFrom) {
          const fade = ((elapsed - fadeFrom) / INTERRUPT_FADE_MS) ** 2;
          opacity = 1 - fade;
          scale *= 1 - (1 - INTERRUPT_SHRINK) * fade;
        }
        const step = Math.floor(icon.cutProgress * CAST_ARC_STEPS);
        if (step > 0) {
          arcTexture = this.arcTexture(step, true);
          arcOpacity = 1;
        }
        label = icon.enemy && elapsed < INTERRUPT_LABEL_MS;
      }
      if (icon.cooldown && !arcTexture) {
        arcTexture = this.arcTexture(CAST_ARC_STEPS, false);
        arcOpacity = 1;
      }
      material.opacity = opacity;
      material.rotation = rotation;
      const iconSize = baseSize * (icon.cooldown ? COOLDOWN_ICON_SCALE : 1);
      const size = iconSize * scale * this.unitScale;
      sprite.scale.set(size, size, 1);
      // Directly above the health bar; the newest icon on a caster is
      // centred and an older one sits to its right.
      let slot = 0;
      for (let previous = 0; previous < index; previous++) {
        if (icons[previous].caster === icon.caster) slot++;
      }
      const bottom = caster.barHeight + CAST_ICON_BAR_GAP;
      const casterScale = this.scaleOf(caster);
      sprite.position.set(caster.base.x, caster.base.y + (bottom + iconSize / 2) * casterScale, caster.base.z)
        .addScaledVector(right, slot * baseSize * 1.1 * this.unitScale);
      sprite.visible = true;
      if (arcTexture) {
        const arcMaterial = arc.material;
        if (arcMaterial.map !== arcTexture) {
          arcMaterial.map = arcTexture;
          arcMaterial.needsUpdate = true;
        }
        const blending = flash ? THREE.AdditiveBlending : THREE.NormalBlending;
        if (arcMaterial.blending !== blending) {
          arcMaterial.blending = blending;
          arcMaterial.needsUpdate = true;
        }
        arcMaterial.opacity = arcOpacity * opacity;
        // A cooldown's ring is gold; the cut-off part of an interrupt keeps its own colours.
        arcMaterial.color.set(icon.cooldown && icon.phase !== "interrupted" ? COOLDOWN_ICON_COLOR : "#ffffff");
        arc.scale.set(size * CAST_ARC_SIZE, size * CAST_ARC_SIZE, 1);
        arc.position.copy(sprite.position);
        arc.visible = true;
      } else {
        arc.visible = false;
      }
      let top = bottom + iconSize;
      const labelSprite = this.castLabels[shown];
      if (label) {
        const text = this.labelTexture("Interrupted", INTERRUPT_LABEL_COLOR, false);
        if (labelSprite.material.map !== text.texture) {
          labelSprite.material.map = text.texture;
          labelSprite.material.needsUpdate = true;
        }
        labelSprite.material.opacity = opacity;
        const height = INTERRUPT_LABEL_HEIGHT * this.unitScale;
        labelSprite.scale.set(height * text.aspect, height, 1);
        labelSprite.position.copy(sprite.position).setY(caster.base.y + (top + 0.1) * casterScale);
        labelSprite.visible = true;
        top += 0.1 + INTERRUPT_LABEL_HEIGHT;
      } else {
        labelSprite.visible = false;
      }
      this.castIconTops.set(icon.caster, Math.max(this.castIconTops.get(icon.caster) ?? 0, top));
      this.castSpriteIcons[shown] = index;
      shown++;
    }
    for (let index = shown; index < MAX_CAST_ICONS; index++) {
      this.castSprites[index].visible = false;
      this.castArcs[index].visible = false;
      this.castLabels[index].visible = false;
    }
    // Nameplates sit above their unit's icons.
    this.updatePlates();
  }

  // The cast outline traced `step / CAST_ARC_STEPS` of the way round,
  // clockwise from 12 o'clock (grey with a red tick at the end when `cut`);
  // created on first use and kept.
  private arcTexture(step: number, cut: boolean): THREE.CanvasTexture {
    const textures = cut ? this.cutArcTextures : this.arcTextures;
    let texture = textures[step];
    if (!texture) {
      texture = createArcTexture(step / CAST_ARC_STEPS, cut);
      textures[step] = texture;
    }
    return texture;
  }

  /** Starts loading cast icons ahead of their first draw, through the same cache as iconTexture. */
  preloadIcons(urls: readonly string[]) {
    // Newest insert is most recently used, so walk backwards: the earliest
    // urls end up freshest and are the last to be evicted.
    for (let i = Math.min(urls.length, MAX_ICON_TEXTURES) - 1; i >= 0; i--) {
      if (this.disposed) return;
      this.iconTexture(urls[i]!);
    }
  }

  // The icon's texture once loaded, starting the load on first use; null
  // while loading or after a failed load (retried after ICON_RETRY_MS).
  private iconTexture(url: string): THREE.Texture | null {
    const cached = this.iconTextures.get(url);
    if (cached !== undefined && !(typeof cached === "number" && this.now() - cached >= ICON_RETRY_MS)) {
      // Re-insert to keep the cache in least-recently-used order.
      this.iconTextures.delete(url);
      this.iconTextures.set(url, cached);
      return typeof cached === "object" ? cached : null;
    }
    this.iconTextures.delete(url);
    this.iconTextures.set(url, "loading");
    this.textureLoader.load(corsTextureUrl(url), (texture) => {
      if (this.disposed || this.iconTextures.get(url) !== "loading") {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      this.iconTextures.set(url, texture);
      this.requestRender();
    }, undefined, () => {
      if (this.disposed || this.iconTextures.get(url) !== "loading") return;
      this.iconTextures.set(url, this.now());
      this.requestRender();
    });
    if (this.iconTextures.size > MAX_ICON_TEXTURES) {
      // Evict the least recently used icon that is not on screen.
      for (const [oldestUrl, oldest] of this.iconTextures) {
        if (typeof oldest === "object" && this.castSprites.some((sprite) => sprite.visible && sprite.material.map === oldest)) continue;
        if (typeof oldest === "object") oldest.dispose();
        this.iconTextures.delete(oldestUrl);
        break;
      }
    }
    return null;
  }

  private labelTexture(text: string, color: string, crit: boolean) {
    const key = `${text}|${color}|${crit}`;
    let label = this.labelTextures.get(key);
    if (label) {
      // Re-insert to keep the cache in least-recently-used order.
      this.labelTextures.delete(key);
      this.labelTextures.set(key, label);
      return label;
    }
    label = createTextTexture(crit ? `${text}!` : text, color);
    this.labelTextures.set(key, label);
    if (this.labelTextures.size > MAX_LABEL_TEXTURES) {
      const [oldestKey, oldest] = this.labelTextures.entries().next().value!;
      // Still drawn this frame by another sprite? Keep it one more round.
      if (![...this.combatSprites, ...this.castLabels].some((sprite) => sprite.material.map === oldest.texture)) {
        oldest.texture.dispose();
        this.labelTextures.delete(oldestKey);
      }
    }
    return label;
  }

  // Health bars above the units, facing the camera at a constant screen size,
  // with a thin power strip under the health while the unit is alive and has
  // power, over the declutter's picks; players' are smaller. Units with a nameplate (hovered,
  // selected, its target chain, pinned) show their health there instead.
  updateBars() {
    // Sizes for the bar being drawn: players' are smaller.
    let width = 0;
    let thickness = 0;
    let padding = 0;
    let strip = 0;
    let stripGap = 0;
    const right = this.vectorB.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const up = this.vectorC.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    let count = 0;
    // The bar's lift above the unit's base, in scene units.
    let barLift = BAR_HEIGHT;
    const fx = this.effects?.fx ?? null;
    // `down`: how far below the health bar's centre, across the screen.
    const quad = (base: THREE.Vector3, from: number, to: number, quadWidth: number, quadHeight: number, color: THREE.Color | number, down = 0) => {
      const center = this.vector.copy(base).setY(base.y + barLift).addScaledVector(right, ((from + to) / 2 - 0.5) * width).addScaledVector(up, -down);
      this.matrix.compose(center, this.camera.quaternion, this.scaleVector.set(quadWidth, quadHeight, 1));
      this.bars.setMatrixAt(count, this.matrix);
      this.bars.setColorAt(count, typeof color === "number" ? this.color.setHex(color) : color);
      count++;
    };
    // A unit with a nameplate shows its health and power there instead.
    const plated = this.plateGuids();
    for (const [guid, object] of this.units) {
      const { health } = object;
      if (!object.bar || plated.has(guid) || !object.group.visible || !health || count + BAR_QUADS > BAR_POOL_SIZE) continue;
      const dead = health.dead || object.dead;
      barLift = object.barHeight * this.scaleOf(object);
      const size = this.unitScale * (object.kind === "player" ? PLAYER_BAR_SCALE : 1);
      width = BAR_WIDTH * size;
      thickness = BAR_THICKNESS * size;
      padding = BAR_PADDING * size;
      strip = POWER_STRIP_THICKNESS * size;
      stripGap = POWER_STRIP_GAP * size;
      const fraction = health.max > 0 ? Math.min(1, Math.max(0, health.current / health.max)) : 0;
      const absorb = health.max > 0 ? Math.min(1 - fraction, Math.max(0, health.absorb / health.max)) : 0;
      // From the effect clock while effects run, so the chunk shrinks
      // smoothly between replay ticks; the tick's value otherwise.
      const gain = fx ? deriveRecentHealGain(fx, object.group.userData.guid as string, this.effectCursorMs) : health.healGain ?? 0;
      const healed = health.max > 0 ? Math.min(fraction, Math.max(0, gain / health.max)) : 0;
      const power = dead ? null : object.powerLevel;
      // The backing grows down to hold the power strip.
      const below = power ? stripGap + strip : 0;
      quad(object.base, 0, 1, width + padding, thickness + padding + below, dead ? BAR_DEAD : BAR_BACKGROUND, below / 2);
      if (dead) continue;
      if (fraction > 0) quad(object.base, 0, fraction, width * fraction, thickness, this.color.setStyle(healthBarColor(fraction)));
      if (healed > 0) quad(object.base, fraction - healed, fraction, width * healed, thickness, BAR_HEAL);
      if (absorb > 0) quad(object.base, fraction, fraction + absorb, width * absorb, thickness, BAR_ABSORB);
      if (power && power.fraction > 0) {
        quad(object.base, 0, power.fraction, width * power.fraction, strip, this.color.setStyle(power.color), (thickness + strip) / 2 + stripGap);
      }
    }
    commitPool(this.bars, count);
  }

  // The units with a nameplate: the hovered unit, the selected unit, its
  // target, their target and pinned units.
  private plateGuids(): Set<string> {
    const { roles } = this;
    const guids = new Set<string>(roles.pinned);
    for (const guid of [roles.selected, roles.target, roles.targetsTarget, this.hoveredGuid]) {
      if (guid) guids.add(guid);
    }
    return guids;
  }

  // Nameplates: name, health, power and cast, live, at a fixed screen size.
  updatePlates() {
    const wanted = this.plateGuids();
    for (const guid of [...this.plates.keys()]) {
      const object = this.units.get(guid);
      if (!wanted.has(guid) || !object || !object.group.visible) this.removePlate(guid);
    }
    for (const guid of wanted) {
      const object = this.units.get(guid);
      if (object?.group.visible) this.updatePlate(guid, object);
    }
  }

  private updatePlate(guid: string, object: UnitObject) {
    let plate = this.plates.get(guid);
    if (!plate) {
      const canvas = document.createElement("canvas");
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
      sprite.center.set(0.5, 0);
      this.scene.add(sprite);
      plate = { sprite, canvas, key: "" };
      this.plates.set(guid, plate);
    }
    // The hovered unit's plate draws over the others.
    plate.sprite.renderOrder = guid === this.hoveredGuid ? 11 : 10;
    const info = this.plateInfo(guid, object);
    const size = unitPlateSize(info);
    // Redraw only when something it shows changes (to the percent).
    const key = JSON.stringify(info, (_key, value: unknown) => (typeof value === "number" ? Math.round(value * 100) / 100 : value));
    if (key !== plate.key) {
      plate.key = key;
      if (plate.canvas.width !== size.width * UNIT_PLATE.scale || plate.canvas.height !== size.height * UNIT_PLATE.scale) {
        plate.canvas.width = size.width * UNIT_PLATE.scale;
        plate.canvas.height = size.height * UNIT_PLATE.scale;
        plate.sprite.material.map?.dispose();
        const texture = new THREE.CanvasTexture(plate.canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        plate.sprite.material.map = texture;
        plate.sprite.material.needsUpdate = true;
      }
      drawUnitPlate(plate.canvas.getContext("2d")!, info);
      plate.sprite.material.map!.needsUpdate = true;
    }
    // Above the unit's cast icons while it has any.
    const iconTop = this.castIconTops.get(guid);
    const height = iconTop !== undefined ? iconTop + CAST_ICON_TOP_GAP : object.labelHeight;
    const { position } = object.group;
    plate.sprite.position.set(position.x, position.y + height * this.scaleOf(object), position.z);
    // A fixed size on screen, like a game's nameplate, however close the camera is.
    const viewportHeight = this.renderer.domElement.clientHeight || 1;
    const worldPerPixel = (2 * this.camera.position.distanceTo(plate.sprite.position) * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / viewportHeight;
    plate.sprite.scale.set(size.width * PLATE_SCREEN_SCALE * worldPerPixel, size.height * PLATE_SCREEN_SCALE * worldPerPixel, 1);
  }

  // What a unit's nameplate shows, from what the scene already has.
  private plateInfo(guid: string, object: UnitObject): UnitPlateInfo {
    const health = object.healthFraction ?? (object.health && object.health.max > 0 ? object.health.current / object.health.max : null);
    const cast = this.unitCasts.get(guid);
    return {
      name: object.name,
      nameColor: object.kind === "hostile" ? ENEMY_RED : object.color,
      owner: object.owner ? this.units.get(object.owner)?.name ?? null : null,
      health: health === null ? null : {
        fraction: health,
        color: healthBarColor(health),
        text: object.health && object.health.max > 0 ? `${shortNumber(object.health.current)} / ${shortNumber(object.health.max)}` : null,
      },
      power: object.powerLevel,
      cast: cast ? { name: cast.spellName || "Casting", progress: cast.progress, color: `#${this.castColor(cast).getHexString()}` } : null,
      dead: object.dead,
    };
  }

  private removePlate(guid: string) {
    const plate = this.plates.get(guid);
    if (!plate) return;
    this.scene.remove(plate.sprite);
    plate.sprite.material.map?.dispose();
    plate.sprite.material.dispose();
    this.plates.delete(guid);
  }

  dispose() {
    for (const guid of [...this.plates.keys()]) this.removePlate(guid);
    for (const pool of [this.bars]) {
      pool.geometry.dispose();
      pool.material.dispose();
      pool.dispose();
    }
    for (const sprite of this.combatSprites) sprite.material.dispose();
    for (const { texture } of this.labelTextures.values()) texture.dispose();
    for (const sprite of [...this.castSprites, ...this.castArcs, ...this.castLabels]) sprite.material.dispose();
    for (const texture of [...this.arcTextures, ...this.cutArcTextures]) texture?.dispose();
    for (const texture of this.iconTextures.values()) {
      if (typeof texture === "object") texture.dispose();
    }
  }
}
