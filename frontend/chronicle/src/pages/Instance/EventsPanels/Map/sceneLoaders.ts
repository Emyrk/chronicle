/**
 * Module-level loaders and caches for MapScene3D (chronicle-1970): the one
 * glTF loader, the parsed dungeon meshes every scene shares, and the walk,
 * whelp and game-model templates. Loaded once per URL and never disposed by a
 * scene. Moved verbatim out of MapScene3D.ts.
 */
import * as THREE from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { MeshBVH } from "three-mesh-bvh";
import { dungeonMeshBytes, dungeonMeshPlacement, releaseDungeonMeshBytes } from "./dungeonMeshes";
import { cachedModelAsset } from "./modelAnimation";
import type { DungeonMeshRequest } from "./MapScene3D";
import { GROUND_WIDTH, MESH_PLAYER_HEIGHT_YARDS, PLAYER_GEOMETRY_HEIGHT } from "./sceneConstants";

export interface DungeonMeshCave {
  mesh: THREE.Mesh;
  bvh: MeshBVH;
  /** World -> mesh-local, for floor probes. */
  inverse: THREE.Matrix4;
}

interface AnimatedGameModelTemplate extends WalkAvatarTemplate {
  box: THREE.Box3;
}

export interface WalkAvatarTemplate {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
}

/** A creature keeps its own height in yards, within these (a chicken stays visible, a gryphon out of the camera). */
const WALK_AVATAR_MIN_YARDS = 1.5;
const WALK_AVATAR_MAX_YARDS = 3.5;

// Each creature's glTF, loaded once and cloned for every walk. Never disposed
// (like the dungeon meshes); a failed load is forgotten so it can be retried.
const walkAvatarTemplates = new Map<string, Promise<WalkAvatarTemplate>>();
export function loadWalkAvatar(url: string): Promise<WalkAvatarTemplate> {
  let template = walkAvatarTemplates.get(url);
  if (!template) {
    template = gltfLoader().then((loader) => loader.loadAsync(url)).then((gltf) => {
      // Feet on the ground at the creature's height in yards (the avatar group's
      // PLAYER_GEOMETRY_HEIGHT is a MESH_PLAYER_HEIGHT_YARDS tall player), turned
      // to face -z (glTF models face +z).
      const height = new THREE.Box3().setFromObject(gltf.scene).max.y;
      const yards = Math.min(WALK_AVATAR_MAX_YARDS, Math.max(WALK_AVATAR_MIN_YARDS, height));
      if (height > 0) gltf.scene.scale.multiplyScalar((yards * PLAYER_GEOMETRY_HEIGHT) / (MESH_PLAYER_HEIGHT_YARDS * height));
      gltf.scene.rotation.y = Math.PI;
      return { scene: gltf.scene, clips: gltf.animations };
    });
    template.catch(() => walkAvatarTemplates.delete(url));
    walkAvatarTemplates.set(url, template);
  }
  return template;
}

// Keep the skinned source separate from the flattened static model cache. All
// visible Rookery Whelps share these assets but need their own skeleton pose.
const flappingWhelpTemplates = new Map<string, Promise<WalkAvatarTemplate>>();
export function loadFlappingWhelp(url: string): Promise<WalkAvatarTemplate> {
  let template = flappingWhelpTemplates.get(url);
  if (!template) {
    template = gltfLoader().then((loader) => loader.loadAsync(url)).then((gltf) => ({ scene: gltf.scene, clips: gltf.animations }));
    template.catch(() => flappingWhelpTemplates.delete(url));
    flappingWhelpTemplates.set(url, template);
  }
  return template;
}

// Original game models retain their skinned base hierarchy. Animation packs are
// fetched separately after a visible unit has attached the base model.
const animatedGameModelTemplates = new Map<string, Promise<AnimatedGameModelTemplate>>();
const gameModelAnimationPacks = new Map<string, Promise<THREE.AnimationClip[]>>();

export function loadAnimatedGameModel(url: string): Promise<AnimatedGameModelTemplate> {
  return cachedModelAsset(animatedGameModelTemplates, url, () =>
    gltfLoader().then((loader) => loader.loadAsync(url)).then((gltf) => ({
      scene: gltf.scene,
      clips: gltf.animations,
      box: new THREE.Box3().setFromObject(gltf.scene),
    })),
  );
}

export function loadGameModelAnimationPack(url: string): Promise<THREE.AnimationClip[]> {
  return cachedModelAsset(gameModelAnimationPacks, url, () =>
    gltfLoader().then((loader) => loader.loadAsync(url)).then((gltf) => gltf.animations),
  );
}

// Loaded on first use so the glTF loader and meshopt decoder stay out of the
// 3D chunk until a boss mini is needed. The minis use EXT_meshopt_compression.
// One glTF loader (and meshopt decoder) for every scene.
let sharedGltfLoader: Promise<GLTFLoader> | null = null;
export function gltfLoader(): Promise<GLTFLoader> {
  sharedGltfLoader ??= createGltfLoader();
  return sharedGltfLoader;
}

// A dungeon mesh parsed and placed once, with its floor-probe trees: scenes
// clone `template` (sharing geometry and materials), so a remounted view (a
// layout change, focus mode, the panel's help page) skips the download, the
// parse and the BVH build. Never disposed by a scene; a scene's renderer
// frees its own GPU copies when it is disposed.
interface ParsedDungeonMesh {
  template: THREE.Group;
  caves: DungeonMeshCave[];
  /** Water (and other liquid) planes: units stand on them, but they never block the camera. */
  liquids: DungeonMeshCave[];
  scale: number;
  radius: number;
}
const parsedDungeonMeshes = new Map<string, Promise<ParsedDungeonMesh | null>>();
const MAX_PARSED_DUNGEON_MESHES = 2;

export function parsedDungeonMesh(request: DungeonMeshRequest): Promise<ParsedDungeonMesh | null> {
  let parsed = parsedDungeonMeshes.get(request.url);
  if (!parsed) {
    parsed = parseDungeonMesh(request);
    parsedDungeonMeshes.set(request.url, parsed);
    void parsed.then((result) => {
      if (!result) parsedDungeonMeshes.delete(request.url);
    });
    for (const oldest of parsedDungeonMeshes.keys()) {
      if (parsedDungeonMeshes.size <= MAX_PARSED_DUNGEON_MESHES) break;
      parsedDungeonMeshes.delete(oldest);
    }
  }
  return parsed;
}

async function parseDungeonMesh(request: DungeonMeshRequest): Promise<ParsedDungeonMesh | null> {
  try {
    // The bytes may already be on their way: the map prefetches them while the encounter processes.
    const [loader, { MeshBVH }, bytes] = await Promise.all([gltfLoader(), import("three-mesh-bvh"), dungeonMeshBytes(request.url)]);
    const gltf = await loader.parseAsync(bytes, THREE.LoaderUtils.extractUrlBase(request.url));
    releaseDungeonMeshBytes(request.url);
    for (const node of gltf.scene.children) node.position.set(0, 0, 0);
    const placement = dungeonMeshPlacement(request.bounds, GROUND_WIDTH);
    const template = new THREE.Group();
    template.rotation.y = placement.rotationY;
    template.scale.setScalar(placement.scale);
    template.position.set(placement.x, 0, placement.z);
    template.add(gltf.scene);
    template.updateMatrixWorld(true);
    const caves: DungeonMeshCave[] = [];
    const liquids: DungeonMeshCave[] = [];
    gltf.scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (isLiquid(mesh, gltf.scene)) {
        // Water planes: translucent, drawn after the cave without writing
        // depth; tinted when the entry says the liquid is not water.
        for (const material of materials) {
          material.transparent = true;
          material.depthWrite = false;
          if (request.liquid && "color" in material && material.color instanceof THREE.Color) {
            material.color.set(request.liquid.color);
            material.opacity = request.liquid.opacity;
          }
        }
        mesh.renderOrder = 1;
        liquids.push({ mesh, bvh: new MeshBVH(mesh.geometry), inverse: mesh.matrixWorld.clone().invert() });
        return;
      }
      // Probes use the template's fixed transforms, which every clone shares.
      caves.push({ mesh, bvh: new MeshBVH(mesh.geometry), inverse: mesh.matrixWorld.clone().invert() });
    });
    if (caves.length === 0) return null;
    const radius = new THREE.Box3().setFromObject(template).getBoundingSphere(new THREE.Sphere()).radius;
    return { template, caves, liquids, scale: placement.scale, radius };
  } catch (error) {
    console.warn("Dungeon mesh unavailable, keeping the map tiles", request.url, error);
    return null;
  }
}

async function createGltfLoader(): Promise<GLTFLoader> {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/libs/meshopt_decoder.module.js"),
  ]);
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
}

export function disposeModelMaterials(materials: readonly THREE.Material[]) {
  for (const material of new Set(materials)) {
    const map = (material as THREE.MeshStandardMaterial).map;
    map?.dispose();
    material.dispose();
  }
}

// The minis' positions are quantized (KHR_mesh_quantization) with the scale in
// the node transform; bake that into float positions, float UVs and fresh
// normals.
export function bakedGeometry(mesh: THREE.Mesh): THREE.BufferGeometry {
  const source = mesh.geometry.getAttribute("position");
  const positions = new Float32Array(source.count * 3);
  const vertex = new THREE.Vector3();
  const skinned = mesh instanceof THREE.SkinnedMesh ? mesh : null;
  skinned?.skeleton.update();
  for (let index = 0; index < source.count; index++) {
    vertex.fromBufferAttribute(source, index);
    skinned?.applyBoneTransform(index, vertex);
    vertex.applyMatrix4(mesh.matrixWorld).toArray(positions, index * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const uv = mesh.geometry.getAttribute("uv");
  if (uv) {
    const uvs = new Float32Array(uv.count * 2);
    for (let index = 0; index < uv.count; index++) {
      uvs[index * 2] = uv.getX(index);
      uvs[index * 2 + 1] = uv.getY(index);
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  }
  const index = mesh.geometry.getIndex();
  if (index) geometry.setIndex(new THREE.BufferAttribute(index.array.slice(), 1));
  geometry.computeVertexNormals();
  return geometry;
}

// The mesh's water planes are the `liquid_*` nodes (a multi-primitive node
// becomes a group of meshes, so check the ancestors too).
function isLiquid(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node && node !== root; node = node.parent) {
    if (/^liquid/i.test(node.name)) return true;
  }
  return false;
}
