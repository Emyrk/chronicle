import type { Material, Object3D, Texture, WebGLRenderer } from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { corsAssetUrl } from "@/pages/Instance/EventsPanels/Map/dungeonMeshes";

interface ThumbnailRenderer {
  renderer: WebGLRenderer;
  loader: GLTFLoader;
  THREE: typeof import("three");
}

const WIDTH = 640;
const HEIGHT = 480;
let rendererPromise: Promise<ThumbnailRenderer> | null = null;
let renderQueue = Promise.resolve();
const thumbnails = new Map<string, Promise<string>>();

function disposeMaterial(material: Material) {
  for (const value of Object.values(material)) {
    if (value && typeof value === "object" && "isTexture" in value) {
      (value as Texture).dispose();
    }
  }
  material.dispose();
}

function disposeObject(object: Object3D) {
  object.traverse((child) => {
    if (!("isMesh" in child) || !child.isMesh) return;
    const mesh = child as Object3D & {
      geometry?: { dispose: () => void };
      material?: Material | Material[];
    };
    mesh.geometry?.dispose();
    if (Array.isArray(mesh.material)) mesh.material.forEach(disposeMaterial);
    else if (mesh.material) disposeMaterial(mesh.material);
  });
}

async function createThumbnailRenderer(): Promise<ThumbnailRenderer> {
  const [THREE, { GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import("three"),
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/libs/meshopt_decoder.module.js"),
  ]);
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  return {
    renderer,
    loader: new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),
    THREE,
  };
}

async function renderThumbnail(url: string): Promise<string> {
  rendererPromise ??= createThumbnailRenderer();
  const { renderer, loader, THREE } = await rendererPromise;
  const gltf = await loader.loadAsync(corsAssetUrl(url));
  const model = gltf.scene;

  try {
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    if (bounds.isEmpty()) throw new Error("Miniature has no renderable geometry");
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    model.position.sub(center);
    model.rotation.y = Math.PI * 0.08;

    const scene = new THREE.Scene();
    scene.add(model);
    scene.add(new THREE.HemisphereLight(0xfff1cf, 0x17120c, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffe4b5, 3.5);
    keyLight.position.set(3, 5, 4);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x7da7ff, 1.8);
    rimLight.position.set(-4, 2, -3);
    scene.add(rimLight);

    const radius = Math.max(size.length() / 2, 0.1);
    const camera = new THREE.PerspectiveCamera(32, WIDTH / HEIGHT, Math.max(radius / 100, 0.001), Math.max(radius * 20, 20));
    camera.position.set(radius * 1.6, radius * 0.75, radius * 2.8);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    renderer.clear();
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/png");
  } finally {
    disposeObject(model);
  }
}

/** Renders model cards one at a time through one shared WebGL context. */
export function miniatureThumbnail(url: string): Promise<string> {
  const cached = thumbnails.get(url);
  if (cached) return cached;

  const result = renderQueue.then(() => renderThumbnail(url));
  renderQueue = result.then(() => undefined, () => undefined);
  thumbnails.set(url, result);
  return result;
}
