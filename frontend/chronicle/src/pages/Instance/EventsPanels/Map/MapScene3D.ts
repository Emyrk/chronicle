import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mapAssetUrl, type WowMapLayer, type WowMapTile } from "@/pages/Technical/mapGallery";
import { FULL_MAP_VIEWPORT, mapPointToScene, type MapPoint, type MapViewport } from "./mapModel";
import type { MapMarkerKind, MapSceneGround } from "./useMapScene";

/** Ground plane width in scene units; depth follows the artwork's aspect. */
export const GROUND_WIDTH = 100;
const MUTED_OPACITY = 0.28;
const LABEL_HEIGHT = 5;
// Default camera directions from the target.
const ANGLED_OFFSET = new THREE.Vector3(0, 0.85, 0.75);
// A tiny +z offset keeps OrbitControls' up vector stable while leaving
// artwork-up at the top of the screen, as in the 2D view.
const TOP_DOWN_OFFSET = new THREE.Vector3(0, 1, 0.0001);

export interface MapScene3DUnit {
  guid: string;
  point: MapPoint;
  facing: number;
  color: string;
  kind: MapMarkerKind;
  muted: boolean;
  name: string;
}

interface UnitObject {
  group: THREE.Group;
  body: THREE.Mesh;
  bodyMaterial: THREE.MeshLambertMaterial;
  coneMaterial: THREE.MeshLambertMaterial;
  kind: MapMarkerKind;
  name: string;
}

function createUnitGeometries(): Record<MapMarkerKind | "cone", THREE.BufferGeometry> {
  // Bodies stand on the ground plane; the cone sits in front of the body and
  // points along -z, which a rotation of `facing` about y turns to the unit's
  // heading (WoW facing is counter-clockwise from world north = artwork up).
  const player = new THREE.CapsuleGeometry(0.9, 1.2, 4, 12).translate(0, 1.5, 0);
  const hostile = new THREE.BoxGeometry(1.8, 1.8, 1.8).translate(0, 0.9, 0);
  const pet = new THREE.CylinderGeometry(0.6, 0.6, 1.2, 12).translate(0, 0.6, 0);
  const cone = new THREE.ConeGeometry(0.55, 1.3, 10).rotateX(-Math.PI / 2).translate(0, 0.6, -1.9);
  return { player, hostile, pet, cone };
}

/**
 * Imperative three.js scene for the Map panel's 3D view: the artwork as a
 * textured ground plane and units as primitives. Owned by MapView3D through a
 * ref; React never reconciles three objects. Renders on demand.
 */
export class MapScene3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000);
  private readonly controls: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly geometries = createUnitGeometries();
  private readonly groundGroup = new THREE.Group();
  private readonly unitsGroup = new THREE.Group();
  private readonly units = new Map<string, UnitObject>();
  private readonly textureLoader = new THREE.TextureLoader();
  private label: THREE.Sprite | null = null;
  private hoveredGuid: string | null = null;
  private groundKey = "";
  private aspect = 1;
  private viewport: MapViewport = FULL_MAP_VIEWPORT;
  private unitScale = 1;
  private frame = 0;
  private disposed = false;

  private readonly container: HTMLElement;
  private readonly onContextLost: () => void;

  constructor(container: HTMLElement, onContextLost: () => void) {
    this.container = container;
    this.onContextLost = onContextLost;
    // Throws when WebGL is unavailable; the caller falls back to 2D.
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x11100d);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.addEventListener("webglcontextlost", this.handleContextLost);
    this.renderer.domElement.addEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.addEventListener("pointerleave", this.handlePointerLeave);
    container.appendChild(this.renderer.domElement);

    this.textureLoader.setCrossOrigin("anonymous");
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-30, 80, 40);
    this.scene.add(sun);
    this.scene.add(this.groundGroup, this.unitsGroup);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 400;
    this.controls.addEventListener("change", this.handleControlsChange);

    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(container);
    this.resize();
    this.resetCamera(false);
  }

  setGround(ground: MapSceneGround) {
    const { canvas, overlays, iconBaseUrl } = ground;
    const key = `${iconBaseUrl}|${canvas.width}x${canvas.height}|${canvas.tiles.map((tile) => tile.fileDataID).join(",")}|${overlays?.map((overlay) => overlay.id).join(",") ?? ""}`;
    if (key === this.groundKey) return;
    const aspectChanged = this.groundKey === "" || canvas.height / canvas.width !== this.aspect;
    this.groundKey = key;
    this.aspect = canvas.height / canvas.width;
    this.clearGround();

    const depth = GROUND_WIDTH * this.aspect;
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(GROUND_WIDTH, depth).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x11100d }),
    );
    backdrop.position.y = -0.02;
    this.groundGroup.add(backdrop);

    // Same fractions as tilePlacement / overlayTilePlacement in mapGallery.
    const addTile = (tile: WowMapTile, left: number, top: number, width: number, height: number, y: number) => {
      // The 2D view clips tiles that overhang the canvas; crop them the same way.
      const croppedWidth = Math.min(width, 1 - left);
      const croppedHeight = Math.min(height, 1 - top);
      if (croppedWidth <= 0 || croppedHeight <= 0) return;
      const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(croppedWidth * GROUND_WIDTH, croppedHeight * depth).rotateX(-Math.PI / 2),
        material,
      );
      mesh.position.set(
        (left + croppedWidth / 2 - 0.5) * GROUND_WIDTH,
        y,
        (top + croppedHeight / 2 - 0.5) * depth,
      );
      // Hidden until textured so pending or failed tiles show the backdrop.
      mesh.visible = false;
      this.groundGroup.add(mesh);
      this.textureLoader.load(corsTextureUrl(mapAssetUrl(iconBaseUrl, tile.path)), (texture) => {
        if (this.disposed || mesh.parent !== this.groundGroup) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.repeat.set(croppedWidth / width, croppedHeight / height);
        texture.offset.set(0, 1 - croppedHeight / height);
        material.map = texture;
        material.needsUpdate = true;
        mesh.visible = true;
        this.requestRender();
      });
    };

    for (const tile of canvas.tiles) {
      addTile(
        tile,
        tile.column * canvas.tileWidth / canvas.width,
        tile.row * canvas.tileHeight / canvas.height,
        canvas.tileWidth / canvas.width,
        canvas.tileHeight / canvas.height,
        0,
      );
    }
    const layer = canvas as WowMapLayer;
    for (const overlay of overlays ?? []) {
      for (const tile of overlay.tiles) {
        addTile(
          tile,
          (overlay.offsetX + tile.column * 256) / layer.width,
          (overlay.offsetY + tile.row * 256) / layer.height,
          256 / layer.width,
          256 / layer.height,
          0.01,
        );
      }
    }
    if (aspectChanged) this.setViewport(this.viewport);
    this.requestRender();
  }

  setUnits(units: MapScene3DUnit[]) {
    const seen = new Set<string>();
    for (const unit of units) {
      seen.add(unit.guid);
      let object = this.units.get(unit.guid);
      if (object && object.kind !== unit.kind) {
        this.removeUnit(unit.guid);
        object = undefined;
      }
      if (!object) object = this.addUnit(unit);
      object.name = unit.name;
      const { x, z } = mapPointToScene(unit.point, this.aspect, GROUND_WIDTH);
      object.group.position.set(x, 0, z);
      object.group.rotation.y = unit.facing;
      object.group.scale.setScalar(this.unitScale);
      const opacity = unit.muted ? MUTED_OPACITY : 1;
      for (const material of [object.bodyMaterial, object.coneMaterial]) {
        material.opacity = opacity;
        material.depthWrite = !unit.muted;
      }
      object.bodyMaterial.color.set(unit.color);
    }
    for (const guid of [...this.units.keys()]) {
      if (!seen.has(guid)) this.removeUnit(guid);
    }
    this.updateLabel();
    this.requestRender();
  }

  /** Frames `viewport` (artwork fractions) from the current viewing angle. */
  setViewport(viewport: MapViewport) {
    this.viewport = viewport;
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.applyViewport(offset.lengthSq() > 0 ? offset.normalize() : ANGLED_OFFSET.clone().normalize());
  }

  /** Re-frames the current viewport straight down (`topDown`) or angled. */
  resetCamera(topDown: boolean) {
    this.applyViewport((topDown ? TOP_DOWN_OFFSET : ANGLED_OFFSET).clone().normalize());
  }

  // The full map at zoom 1 sits at the default angled distance; zoom moves
  // the camera proportionally closer along `direction`.
  private applyViewport(direction: THREE.Vector3) {
    const { x, z } = mapPointToScene(
      { leftPercent: this.viewport.centerX * 100, topPercent: this.viewport.centerY * 100 },
      this.aspect,
      GROUND_WIDTH,
    );
    this.controls.target.set(x, 0, z);
    this.camera.position.copy(direction.multiplyScalar(this.baseDistance() / this.viewport.zoom)).add(this.controls.target);
    this.controls.update();
    this.updateUnitScale();
    this.requestRender();
  }

  private baseDistance(): number {
    return Math.max(GROUND_WIDTH, GROUND_WIDTH * this.aspect) * ANGLED_OFFSET.length();
  }

  // Units are world meshes, so scale them with camera distance to hold a
  // constant on-screen size: zooming in spreads them apart instead of
  // enlarging them. Scale 1 at the default full-map distance.
  private updateUnitScale() {
    const scale = this.camera.position.distanceTo(this.controls.target) / this.baseDistance();
    if (scale === this.unitScale) return;
    this.unitScale = scale;
    for (const object of this.units.values()) object.group.scale.setScalar(scale);
    this.updateLabel();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.removeEventListener("change", this.handleControlsChange);
    this.controls.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    canvas.removeEventListener("pointermove", this.handlePointerMove);
    canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    for (const guid of [...this.units.keys()]) this.removeUnit(guid);
    this.clearLabel();
    this.clearGround();
    for (const geometry of Object.values(this.geometries)) geometry.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
  }

  private addUnit(unit: MapScene3DUnit): UnitObject {
    const bodyMaterial = new THREE.MeshLambertMaterial({ transparent: true });
    const coneMaterial = new THREE.MeshLambertMaterial({ color: 0xf5f5f4, transparent: true });
    const body = new THREE.Mesh(this.geometries[unit.kind], bodyMaterial);
    const cone = new THREE.Mesh(this.geometries.cone, coneMaterial);
    const group = new THREE.Group();
    group.userData.guid = unit.guid;
    body.userData.guid = unit.guid;
    group.add(body, cone);
    group.scale.setScalar(this.unitScale);
    this.unitsGroup.add(group);
    const object = { group, body, bodyMaterial, coneMaterial, kind: unit.kind, name: unit.name };
    this.units.set(unit.guid, object);
    return object;
  }

  private removeUnit(guid: string) {
    const object = this.units.get(guid);
    if (!object) return;
    this.unitsGroup.remove(object.group);
    object.bodyMaterial.dispose();
    object.coneMaterial.dispose();
    this.units.delete(guid);
    if (this.hoveredGuid === guid) this.hoveredGuid = null;
  }

  private clearGround() {
    for (const child of [...this.groundGroup.children]) {
      const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
      mesh.geometry.dispose();
      mesh.material.map?.dispose();
      mesh.material.dispose();
      this.groundGroup.remove(mesh);
    }
  }

  private updateLabel() {
    const object = this.hoveredGuid ? this.units.get(this.hoveredGuid) : undefined;
    if (!object) {
      this.clearLabel();
      return;
    }
    if (this.label?.userData.text !== object.name) {
      this.clearLabel();
      this.label = createLabelSprite(object.name);
      this.label.userData.baseScale = this.label.scale.clone();
      this.scene.add(this.label);
    }
    this.label!.scale.copy(this.label!.userData.baseScale as THREE.Vector3).multiplyScalar(this.unitScale);
    this.label!.position.set(object.group.position.x, LABEL_HEIGHT * this.unitScale, object.group.position.z);
  }

  private clearLabel() {
    if (!this.label) return;
    this.scene.remove(this.label);
    this.label.material.map?.dispose();
    this.label.material.dispose();
    this.label = null;
  }

  private readonly handlePointerMove = (event: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects([...this.units.values()].map((unit) => unit.body), false)[0];
    const guid = (hit?.object.userData.guid as string | undefined) ?? null;
    if (guid === this.hoveredGuid) return;
    this.hoveredGuid = guid;
    this.renderer.domElement.style.cursor = guid ? "pointer" : "";
    this.updateLabel();
    this.requestRender();
  };

  private readonly handlePointerLeave = () => {
    if (!this.hoveredGuid) return;
    this.hoveredGuid = null;
    this.updateLabel();
    this.requestRender();
  };

  private readonly handleControlsChange = () => {
    this.updateUnitScale();
    this.requestRender();
  };

  private readonly handleContextLost = (event: Event) => {
    event.preventDefault();
    this.onContextLost();
  };

  private readonly resize = () => {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  };

  private readonly requestRender = () => {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.disposed) this.renderer.render(this.scene, this.camera);
    });
  };
}

// The 2D view loads the same tiles as plain <img>s, and the CDN's response to
// a request without Origin has no CORS headers and no `Vary: Origin`. The
// browser then reuses that cached response for the texture's CORS request,
// which fails. A distinct query string gives textures their own cache entry.
function corsTextureUrl(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}cors`;
}

function createLabelSprite(text: string): THREE.Sprite {
  const scale = 2;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  const font = `500 ${11 * scale}px ui-sans-serif, system-ui, sans-serif`;
  context.font = font;
  const paddingX = 6 * scale;
  canvas.width = Math.ceil(context.measureText(text).width + paddingX * 2);
  canvas.height = 18 * scale;
  context.font = font;
  context.fillStyle = "rgba(0, 0, 0, 0.85)";
  context.beginPath();
  context.roundRect(0, 0, canvas.width, canvas.height, 4 * scale);
  context.fill();
  context.fillStyle = "#ffffff";
  context.textBaseline = "middle";
  context.fillText(text, paddingX, canvas.height / 2 + scale);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  const worldHeight = 2.4;
  sprite.scale.set(worldHeight * canvas.width / canvas.height, worldHeight, 1);
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 10;
  sprite.userData.text = text;
  return sprite;
}
