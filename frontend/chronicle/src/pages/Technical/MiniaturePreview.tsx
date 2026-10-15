import { useEffect, useRef, useState } from "react";
import type { Material, Object3D, Texture } from "three";
import { corsAssetUrl } from "@/pages/Instance/EventsPanels/Map/dungeonMeshes";

type PreviewState = "idle" | "loading" | "ready" | "error";

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

export function MiniaturePreview({ name, url }: { name: string; url: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<PreviewState>("idle");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: "240px 0px",
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!visible || !host || !canvas) return;

    let disposed = false;
    let frame = 0;
    let model: Object3D | null = null;
    let renderer: import("three").WebGLRenderer | null = null;
    let resizeObserver: ResizeObserver | null = null;
    setState("loading");

    void Promise.all([
      import("three"),
      import("three/examples/jsm/loaders/GLTFLoader.js"),
      import("three/examples/jsm/libs/meshopt_decoder.module.js"),
    ]).then(async ([THREE, { GLTFLoader }, { MeshoptDecoder }]) => {
      if (disposed) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;

      scene.add(new THREE.HemisphereLight(0xfff1cf, 0x17120c, 2.2));
      const keyLight = new THREE.DirectionalLight(0xffe4b5, 3.5);
      keyLight.position.set(3, 5, 4);
      scene.add(keyLight);
      const rimLight = new THREE.DirectionalLight(0x7da7ff, 1.8);
      rimLight.position.set(-4, 2, -3);
      scene.add(rimLight);

      try {
        const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
        const gltf = await loader.loadAsync(corsAssetUrl(url));
        if (disposed) {
          disposeObject(gltf.scene);
          return;
        }

        model = gltf.scene;
        model.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(model);
        if (bounds.isEmpty()) throw new Error("Miniature has no renderable geometry");
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        model.position.sub(center);

        const turntable = new THREE.Group();
        turntable.add(model);
        scene.add(turntable);

        const radius = Math.max(size.length() / 2, 0.1);
        camera.near = Math.max(radius / 100, 0.001);
        camera.far = Math.max(radius * 20, 20);
        camera.position.set(radius * 1.6, radius * 0.75, radius * 2.8);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();

        const resize = () => {
          if (!renderer) return;
          const width = Math.max(1, host.clientWidth);
          const height = Math.max(1, host.clientHeight);
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        resize();

        const started = performance.now();
        const render = (now: number) => {
          if (disposed || !renderer) return;
          turntable.rotation.y = (now - started) * 0.00022;
          renderer.render(scene, camera);
          frame = requestAnimationFrame(render);
        };
        setState("ready");
        frame = requestAnimationFrame(render);
      } catch {
        if (!disposed) setState("error");
      }
    }).catch(() => {
      if (!disposed) setState("error");
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      if (model) disposeObject(model);
      renderer?.dispose();
      renderer?.forceContextLoss();
    };
  }, [url, visible]);

  return (
    <div
      ref={hostRef}
      className="relative aspect-[4/3] w-full overflow-hidden bg-[radial-gradient(circle_at_50%_42%,rgba(251,191,36,0.16),transparent_48%),linear-gradient(180deg,#15140f_0%,#090907_100%)]"
      aria-label={`${name} 3D miniature preview`}
      role="img"
    >
      <div className="pointer-events-none absolute inset-x-[18%] bottom-[12%] h-[12%] rounded-[50%] bg-black/60 blur-md" />
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      {(state === "idle" || state === "loading") && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-200/20 border-t-amber-200/80" />
        </div>
      )}
      {state === "error" && (
        <div className="absolute inset-0 grid place-items-center px-5 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-red-200/65">
          Preview unavailable
        </div>
      )}
    </div>
  );
}
