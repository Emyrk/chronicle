import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { addEffectEvent, createEncounterEffects, DEFAULT_EFFECT_OPTIONS, type ReplayEffectEvent } from "../replayEffects";
import { createTestScene, testUnit } from "./createTestScene";
import { buildSyntheticDungeonGlb, DUNGEON_URL } from "./syntheticDungeon";

// A whole-scene-graph fingerprint (chronicle-1977, committed in chronicle-1982):
// what the scene tests do not assert one by one. Models and miniatures
// (boss mini, guardian mini, animated game model with its animation pack,
// flapping whelp, callout marker), trails, owner and target lines, every
// effect pool, combat text, cast icons, bars and a hovered nameplate, dumped
// at several clock times, with each object's id relative to the scene (three.js
// breaks draw-order ties between transparent objects by id, so creation order
// is behaviour). Compared against __snapshots__/sceneGraphFingerprint.txt.
//
// A refactor must leave the snapshot unchanged. A deliberate change updates it
// (`pnpm vitest run --project unit <this file> -u`) and says in its PR what
// changed and why. Large buffers (instance matrices, line vertices) are
// hashed per object; transforms and materials are written out.

function event(timestampMs: number, kind: ReplayEffectEvent["kind"], source: string, target: string, extra: Partial<ReplayEffectEvent> = {}): ReplayEffectEvent {
  return {
    timestampMs, kind, source, target, school: 4, amount: 1234, overheal: 0, absorbed: 0, effective: kind === "heal" ? 1234 : 0,
    crit: false, periodic: false, attack: "spell", castTimeMs: 0, spellId: 133, spellName: "Fireball", ...extra,
  };
}

const r = (value: number) => (Math.abs(value) < 5e-4 ? "0" : value.toFixed(3));
const list = (values: ArrayLike<number>, count = values.length) => Array.from({ length: Math.min(count, values.length) }, (_, index) => r(values[index]!)).join(",");
// FNV-1a over the rounded values: short, stable, and enough to spot a change.
const digest = (values: ArrayLike<number>, count = values.length) => {
  const text = list(values, count);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
  return `${Math.min(count, values.length)}:${hash.toString(16).padStart(8, "0")}`;
};
// A macrotask the fake timers leave alone (they fake only setTimeout), so fetch and parsing can finish.
const nextTask = () => new Promise<void>((resolve) => (globalThis as unknown as { setImmediate: (callback: () => void) => void }).setImmediate(resolve));

it("the scene graph matches the recorded fingerprint", async () => {
  const glb = buildSyntheticDungeonGlb();
  // Every model URL serves the synthetic dungeon's GLB (a valid, small glTF).
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === DUNGEON_URL || url.endsWith(".glb")) return new Response(glb.slice(0), { status: 200 });
    return new Response(new ArrayBuffer(0), { status: 404 });
  });
  Object.assign(fetchMock, { harness: true });
  vi.stubGlobal("fetch", fetchMock);
  // three's FileLoader reports progress with ProgressEvent, which Node lacks.
  vi.stubGlobal("ProgressEvent", class extends Event {
    constructor(type: string, init: object = {}) {
      super(type);
      Object.assign(this, init);
    }
  });
  // Textures (icons, raid markers) "load" on the next microtask, with their URL kept.
  const loads: string[] = [];
  vi.spyOn(THREE.TextureLoader.prototype, "load").mockImplementation(((url: string, onLoad?: (texture: THREE.Texture) => void) => {
    const texture = new THREE.Texture();
    texture.userData.url = url;
    loads.push(url);
    void Promise.resolve().then(() => onLoad?.(texture));
    return texture;
  }) as never);

  const health = (current: number) => ({ current, max: 100, absorb: 5, dead: false, healGain: 10 });
  const units = () => [
    testUnit("p1", 2, 3, {
      bar: true, health: health(60), power: { fraction: 0.5, color: "#3366ff" }, icon: null, facing: 0.5,
      trail: [{ point: { leftPercent: 52, topPercent: 53 } }, { point: { leftPercent: 50, topPercent: 51 } }, { point: { leftPercent: 48, topPercent: 50 } }] as never,
    }),
    testUnit("p2", -4, 6, { bar: true, health: health(30), kind: "player", z: 0 }),
    testUnit("boss", 0, -2, { kind: "hostile", boss: true, miniatureUrl: "https://assets.test/boss.glb", bar: true, health: health(80), worldHeight: 6 }),
    testUnit("add", 6, -3, { kind: "hostile", miniatureUrl: "https://assets.test/add.glb", gameModel: true, animationUrl: "https://assets.test/add-anims.glb", bar: true, health: health(50) }),
    testUnit("pet", 3, 5, { kind: "pet", owner: "p1", miniatureUrl: "https://assets.test/totem.glb", name: "Searing Totem" }),
    testUnit("whelp", -6, -5, { kind: "hostile", miniatureUrl: "https://assets.test/whelp.glb", flapWings: true }),
    testUnit("marked", 8, 8, { callout: { title: "Tank", subtitle: "Main", color: "#ff0000", marker: "skull" } as never }),
  ];

  // The async loads race when started together (on any version), so the mesh
  // loads first and each unit is added on its own with its loads settled.
  const h = await createTestScene();
  const scene = h.scene;
  const settle = async () => {
    for (let index = 0; index < 60; index++) {
      await nextTask();
      await vi.runAllTimersAsync();
    }
  };
  const all = units();
  for (let count = 1; count <= all.length; count++) {
    scene.setUnits(all.slice(0, count));
    await settle();
  }
  scene.setUnitRoles({ selected: "p1", target: "boss", targetsTarget: "p2", pinned: new Set(["p2"]) });
  const fx = createEncounterEffects();
  for (const entry of [
    event(1000, "damage", "p1", "boss", { attack: "swing", spellId: 6603, spellName: "Auto Attack", school: 1 }),
    event(1050, "damage", "p2", "boss", { spellId: 133, spellName: "Fireball", crit: true }),
    event(1100, "heal", "p2", "p1", { spellId: 2050, spellName: "Lesser Heal", school: 2 }),
    event(1150, "cast_start", "boss", "boss", { spellId: 18431, spellName: "Bellowing Roar", castTimeMs: 2000, school: 4 }),
    event(1200, "cast_start", "p2", "p2", { spellId: 116, spellName: "Frostbolt", castTimeMs: 1500, school: 16 }),
    event(1250, "damage", "boss", "p1", { attack: "melee_ability", spellId: 18392, spellName: "Fireball Volley", school: 4 }),
    event(1700, "interrupt", "p1", "p2", { spellId: 116, spellName: "Frostbolt" }),
    event(2000, "cast_go", "boss", "boss", { spellId: 18431, spellName: "Bellowing Roar" }),
    event(2400, "slain", "boss", "add"),
  ]) addEffectEvent(fx, entry);
  const casters = new Set(["p1", "p2", "boss", "add", "pet", "whelp"]);
  scene.setEffects({
    mapId: undefined, fx, options: { ...DEFAULT_EFFECT_OPTIONS, showPeriodic: true }, resolveColor: (color: string) => (color.startsWith("var(") ? "#ff8800" : color),
    combatTextGuids: casters, suppressNameGuids: new Set(["boss"]), healTextGuids: casters,
    castIcons: {
      guids: casters, priorityGuids: new Set(["boss"]), enemyGuids: new Set(["boss", "add"]), iconUrl: (id: number) => `https://icons.test/${id}.png`,
      placeholderUrl: "https://icons.test/q.png", isProc: (id: number) => id === 6603, isCooldown: (id: number) => id === 18431,
    },
    castSchoolColor: (id: number) => (id === 116 ? "#66ccff" : null),
  } as never);
  await settle();

  const graph = (scene as unknown as { scene: THREE.Scene }).scene;
  const out: string[] = [];
  const dump = (label: string) => {
    graph.updateMatrixWorld(true);
    const base = graph.id;
    out.push(`=== ${label} renders=${h.renders.count} awake=${h.awake} hover=${JSON.stringify(h.events.effectHover.at(-1) ?? null)} compass=${h.events.compass.length}`);
    graph.traverse((object) => {
      const parts = [
        `#${object.id - base}`, object.type, object.name, `p${object.parent ? object.parent.id - base : "-"}`, object.visible ? "v" : "h", `ro${object.renderOrder}`,
        `pos${list(object.position.toArray())}`, `rot${list([object.rotation.x, object.rotation.y, object.rotation.z])}`, `sc${list(object.scale.toArray())}`,
      ];
      const material = (object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      for (const entry of material ? (Array.isArray(material) ? material : [material]) : []) {
        const basic = entry as THREE.MeshBasicMaterial;
        const map = basic.map;
        const image = map?.image as { width?: number; height?: number } | undefined;
        const mapKey = map ? (map.userData.url ?? (image ? `img${image.width}x${image.height}` : "tex")) : "-";
        const saturation = (entry.userData.saturation as { value: number } | undefined)?.value;
        const rotation = (entry as THREE.SpriteMaterial).rotation;
        parts.push(`mat:${entry.type}:${basic.color ? basic.color.getHexString() : "-"}:${r(entry.opacity)}:${entry.transparent ? "t" : "o"}:${entry.depthTest ? "dt" : "nd"}:${mapKey}:${saturation === undefined ? "" : r(saturation)}:${rotation === undefined ? "" : r(rotation)}`);
      }
      const geometry = (object as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (geometry) {
        const position = geometry.getAttribute("position");
        parts.push(`geo:${geometry.type}:${position ? position.count : 0}:${geometry.drawRange.start}-${geometry.drawRange.count}`);
        if ((object as THREE.Line).isLine || (object as THREE.Points).isPoints) {
          const drawn = Math.min(geometry.drawRange.count === Infinity ? (position?.count ?? 0) : geometry.drawRange.count, 400);
          if (position) parts.push(`P[${digest(position.array as Float32Array, drawn * position.itemSize)}]`);
          const color = geometry.getAttribute("color");
          if (color) parts.push(`C[${digest(color.array as Float32Array, drawn * color.itemSize)}]`);
        }
      }
      if ((object as THREE.InstancedMesh).isInstancedMesh) {
        const mesh = object as THREE.InstancedMesh;
        parts.push(`count${mesh.count}`, `M[${digest(mesh.instanceMatrix.array, mesh.count * 16)}]`);
        if (mesh.instanceColor) parts.push(`IC[${digest(mesh.instanceColor.array, mesh.count * 3)}]`);
      }
      if ((object as THREE.Sprite).isSprite) parts.push(`center${list((object as THREE.Sprite).center.toArray())}`);
      out.push(parts.join(" "));
    });
  };

  dump("loaded");
  const p1 = h.screenOf(2, 1, 3);
  h.input.hover(p1.x, p1.y);
  for (const [ms, playing] of [[900, false], [1060, false], [1120, true], [1300, true], [1720, false], [2050, false], [2600, false]] as [number, boolean][]) {
    scene.setEffectClock(ms, playing, 1);
    h.frames(3);
    await settle();
    h.frames(2);
    dump(`t=${ms}`);
  }
  // Units move (trails, owner and target lines follow) and one leaves.
  scene.setUnits(units().filter((unit) => unit.guid !== "whelp").map((unit) => ({ ...unit, point: { leftPercent: unit.point.leftPercent + 3, topPercent: unit.point.topPercent - 2 } })));
  h.frames(4);
  dump("moved");
  const boss = h.screenOf(0, 1, -2);
  h.input.hover(boss.x, boss.y);
  scene.setChipScale(1.5);
  h.frames(3);
  dump("hover boss, chip 1.5");
  out.push(`textures ${loads.join(" ")}`);
  out.push(`pending ${scene.pendingAssets()}`);
  h.dispose();
  out.push(`disposed renderer=${h.renders.disposed}`);
  await expect(out.join("\n") + "\n").toMatchFileSnapshot("./__snapshots__/sceneGraphFingerprint.txt");
});
