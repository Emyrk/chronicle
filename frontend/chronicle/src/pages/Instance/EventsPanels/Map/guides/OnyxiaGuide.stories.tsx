import { useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Flame, RotateCcw, Shield, Skull, Swords, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { WowMapMeshInstance, WowMapRenderedInstance } from "@/pages/Technical/mapGallery";
import { clampViewport, renderedDungeonMapPoint, type MapViewport } from "../mapModel";
import type { MapPositionSample } from "../map.processor";
import type { DungeonMeshRequest, DungeonMeshState } from "../MapScene3D";
import MapView3D from "../MapView3D";
import type { MapSceneGround, MapSceneMarker } from "../useMapScene";
import { guideScene, type RaidGuideExample, type RaidGuideRole, type RaidGuideUnit } from "./raidGuideModel";
import { ONYXIA_GUIDE, ONYXIA_MAP_ID } from "./onyxiaGuide";

const ICON_BASE_URL = "https://icons.chronicleclassic.com/turtle";
const GUIDE_DURATION_MS = 60_000;
const ONYXIA_MESH: WowMapMeshInstance = {
  path: "3d/249-47a487143546bb61-onyxias-lair-octowow-v001-open-top.glb",
  bounds: { minX: -260.0325, maxX: 63.2182, minY: -286.4366, maxY: 26.0842 },
  zMin: -96.4474,
  zMax: 49.5633,
  frame: "wow-yup-mirrored-x",
  liquid: { color: "#d66020", opacity: 0.85 },
};
const ONYXIA_RENDER: WowMapRenderedInstance = {
  path: "renders/249-ec84c64cb8d18001-onyxias-lair-octowow-v001-shaded-water-2400.png",
  width: 2400,
  height: 2482,
  source: "octowow-v001",
  bounds: ONYXIA_MESH.bounds,
};
const GROUND: MapSceneGround = { iconBaseUrl: ICON_BASE_URL, canvas: ONYXIA_RENDER };
const DUNGEON_MESH: DungeonMeshRequest = {
  url: `${ICON_BASE_URL}/maps/${ONYXIA_MESH.path}`,
  bounds: ONYXIA_MESH.bounds,
  liquid: ONYXIA_MESH.liquid,
};
const ARENA_CENTRE = renderedDungeonMapPoint({ timestampMs: 0, x: -24, y: -214, mapId: ONYXIA_MAP_ID }, ONYXIA_MESH.bounds)!;
const ARENA_VIEWPORT = clampViewport({ centerX: ARENA_CENTRE.leftPercent / 100, centerY: ARENA_CENTRE.topPercent / 100, zoom: 1.65 });
const MOBILE_ARENA_VIEWPORT = clampViewport({ centerX: ARENA_CENTRE.leftPercent / 100, centerY: ARENA_CENTRE.topPercent / 100, zoom: 2 });
const BOSS_GUIDS = new Set(["onyxia"]);

const ROLE_STYLE: Record<RaidGuideRole, { color: string; icon: typeof Shield; label: string }> = {
  tank: { color: "#d6a96f", icon: Shield, label: "Tank" },
  healer: { color: "#4ade80", icon: Check, label: "Healer" },
  melee: { color: "#fb7185", icon: Swords, label: "Melee" },
  ranged: { color: "#60a5fa", icon: Flame, label: "Ranged" },
  boss: { color: "#f43f5e", icon: Skull, label: "Onyxia" },
  add: { color: "#fb923c", icon: Skull, label: "Add" },
};

function project(sample: MapPositionSample) {
  return renderedDungeonMapPoint(sample, ONYXIA_MESH.bounds);
}

function marker(unit: RaidGuideUnit): MapSceneMarker {
  const sample: MapPositionSample = {
    timestampMs: 0,
    x: unit.at.x,
    y: unit.at.y,
    mapId: ONYXIA_MAP_ID,
    facing: unit.facing ?? 0,
    ...(unit.at.z === undefined ? {} : { z: unit.at.z }),
  };
  const end = { ...sample, timestampMs: GUIDE_DURATION_MS };
  return {
    guid: unit.id,
    name: unit.name,
    color: ROLE_STYLE[unit.role].color,
    kind: unit.role === "boss" || unit.role === "add" ? "hostile" : "player",
    entry: unit.entry,
    sample,
    positions: [sample, end],
    point: project(sample)!,
    muted: false,
    health: unit.role === "boss" ? { current: 72, max: 100, absorb: 0, dead: false } : null,
    icon: null,
    healthFraction: unit.role === "boss" ? 0.72 : 1,
  };
}

function ExampleSwitch({ value, onChange }: { value: RaidGuideExample; onChange: (value: RaidGuideExample) => void }) {
  return (
    <div className="grid grid-cols-2 rounded-md border border-white/10 bg-black/35 p-1" aria-label="Example raid">
      <button
        type="button"
        aria-pressed={value === "correct"}
        onClick={() => onChange("correct")}
        className={cn(
          "flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] transition",
          value === "correct" ? "bg-emerald-400 text-emerald-950 shadow-[0_0_18px_rgba(52,211,153,.2)]" : "text-white/45 hover:text-white/75",
        )}
      >
        <Check className="h-3.5 w-3.5" /> Right
      </button>
      <button
        type="button"
        aria-pressed={value === "wrong"}
        onClick={() => onChange("wrong")}
        className={cn(
          "flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] transition",
          value === "wrong" ? "bg-rose-500 text-white shadow-[0_0_18px_rgba(244,63,94,.2)]" : "text-white/45 hover:text-white/75",
        )}
      >
        <X className="h-3.5 w-3.5" /> Wrong
      </button>
    </div>
  );
}

function RoleLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-[0.14em] text-white/55">
      {(["tank", "healer", "melee", "ranged", "add"] as const).map((role) => (
        <span key={role} className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full ring-1 ring-black/80" style={{ background: ROLE_STYLE[role].color }} />
          {ROLE_STYLE[role].label}
        </span>
      ))}
    </div>
  );
}

function GuideMap({ chapterIndex, example }: { chapterIndex: number; example: RaidGuideExample }) {
  const mobile = useIsMobile();
  const chapter = ONYXIA_GUIDE.chapters[chapterIndex];
  const scene = guideScene(chapter, example);
  const markers = useMemo(() => scene.units.map(marker), [scene.units]);
  const defaultView = mobile ? MOBILE_ARENA_VIEWPORT : ARENA_VIEWPORT;
  const [meshState, setMeshState] = useState<DungeonMeshState>("loading");
  const [viewState, setViewState] = useState<{ mobile: boolean; viewport: MapViewport }>(() => ({ mobile, viewport: defaultView }));
  const [cameraRevision, setCameraRevision] = useState(0);
  const view = viewState.mobile === mobile ? viewState.viewport : defaultView;
  const resetKey = `${chapter.id}-${example}-${mobile ? "mobile" : "desktop"}-${cameraRevision}`;

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[#080706]">
      <MapView3D
        key={resetKey}
        ground={GROUND}
        markers={markers}
        projectSample={project}
        cursorMs={0}
        playing={false}
        playbackSpeed={1}
        view={{ viewport: view, key: resetKey }}
        onUserViewport={(viewport) => setViewState({ mobile, viewport })}
        bossGuids={BOSS_GUIDS}
        onUnavailable={() => setMeshState("failed")}
        dungeonMesh={DUNGEON_MESH}
        onDungeonMeshState={setMeshState}
        focus={{ centre: ARENA_CENTRE, zoom: defaultView.zoom }}
        topDownKey={1}
        planItems={scene.planItems}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-black/85 via-black/25 to-transparent px-3 pb-10 pt-3 lg:px-5 lg:pt-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-300/80">Tactical rehearsal</div>
          <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-white">
            {example === "correct" ? <Check className="h-4 w-4 text-emerald-400" /> : <X className="h-4 w-4 text-rose-400" />}
            {example === "correct" ? "Correct formation" : "Common failure"}
          </div>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <span className={cn(
            "rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em]",
            meshState === "ready" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-amber-300/20 bg-black/40 text-amber-200/70",
          )}>
            {meshState === "ready" ? "3D lair" : `3D ${meshState}`}
          </span>
          <button
            type="button"
            onClick={() => {
              setViewState({ mobile, viewport: defaultView });
              setCameraRevision((current) => current + 1);
            }}
            title="Reset camera"
            className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/45 text-white/65 backdrop-blur hover:bg-black/70 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-3 bottom-[calc(42dvh+0.75rem)] flex items-end justify-between gap-4 lg:inset-x-4 lg:bottom-4">
        <div className={cn(
          "max-w-xl rounded-md border bg-black/80 px-3 py-2 text-[11px] leading-relaxed text-white/80 shadow-2xl backdrop-blur-md lg:text-xs",
          example === "correct" ? "border-emerald-400/25" : "border-rose-400/25",
        )}>
          <span className={cn("mr-2 font-black uppercase tracking-[0.16em]", example === "correct" ? "text-emerald-300" : "text-rose-300")}>
            {example === "correct" ? "Why it works" : "Why it wipes"}
          </span>
          {scene.callout}
        </div>
        <div className="hidden rounded-md border border-white/10 bg-black/65 px-3 py-2 backdrop-blur-md lg:block">
          <RoleLegend />
        </div>
      </div>
    </div>
  );
}

function OnyxiaGuidePrototype() {
  const [chapterIndex, setChapterIndex] = useState(0);
  const [example, setExample] = useState<RaidGuideExample>("correct");
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  const chapter = ONYXIA_GUIDE.chapters[chapterIndex];
  const previous = () => setChapterIndex((current) => Math.max(0, current - 1));
  const next = () => setChapterIndex((current) => Math.min(ONYXIA_GUIDE.chapters.length - 1, current + 1));

  return (
    <QueryClientProvider client={queryClient}>
      <main className="h-[100dvh] w-screen overflow-hidden border border-amber-200/10 bg-[#100e0b] text-stone-100 shadow-[0_30px_100px_rgba(0,0,0,.65)] lg:mx-auto lg:my-8 lg:h-[760px] lg:w-[1280px] lg:rounded-xl">
        <div className="relative grid h-full grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="absolute inset-x-0 bottom-0 z-30 flex max-h-[42dvh] min-h-0 flex-col overflow-hidden rounded-t-xl border-t border-white/10 bg-[#17130f]/[0.97] shadow-[0_-20px_60px_rgba(0,0,0,.55)] backdrop-blur-md lg:relative lg:inset-auto lg:z-auto lg:max-h-none lg:rounded-none lg:border-r lg:border-t-0 lg:border-white/8 lg:bg-[#17130f] lg:shadow-none lg:backdrop-blur-none">
            <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:radial-gradient(circle_at_20%_0%,rgba(245,158,11,.16),transparent_34%),repeating-linear-gradient(135deg,transparent_0,transparent_14px,rgba(255,255,255,.018)_15px,transparent_16px)]" />
            <header className="relative hidden border-b border-white/8 px-6 pb-5 pt-6 lg:block">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-300/70">Chronicle field guide</div>
                <span className="rounded border border-amber-300/20 bg-amber-300/8 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-amber-200/80">Prototype</span>
              </div>
              <h1 className="mt-3 font-serif text-[34px] font-black leading-none tracking-[-0.035em] text-[#f6ead3]">{ONYXIA_GUIDE.encounter}</h1>
              <div className="mt-2 text-xs text-stone-400">{ONYXIA_GUIDE.instance} · {ONYXIA_GUIDE.server}</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.15em] text-stone-500">{ONYXIA_GUIDE.difficulty}</div>
            </header>

            <nav aria-label="Guide chapters" className="styled-scrollbar relative flex shrink-0 items-center justify-around gap-1 overflow-x-auto border-b border-white/8 px-3 py-2 lg:min-h-0 lg:flex-1 lg:shrink lg:flex-col lg:items-stretch lg:justify-start lg:overflow-y-auto lg:border-b-0 lg:py-3">
              {ONYXIA_GUIDE.chapters.map((entry, index) => {
                const active = index === chapterIndex;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setChapterIndex(index)}
                    className={cn(
                      "group flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-left transition lg:grid lg:grid-cols-[28px_1fr] lg:gap-3 lg:px-3 lg:py-3",
                      active ? "bg-amber-100/[0.075] shadow-[inset_2px_0_0_#f59e0b]" : "hover:bg-white/[0.035]",
                    )}
                  >
                    <span className={cn(
                      "grid h-7 w-7 place-items-center rounded-full border text-[10px] font-black",
                      active ? "border-amber-300/50 bg-amber-300 text-black" : "border-white/10 text-white/35 group-hover:text-white/65",
                    )}>{index + 1}</span>
                    <span className="hidden lg:block">
                      <span className={cn("block text-[9px] font-bold uppercase tracking-[0.16em]", active ? "text-amber-300/80" : "text-white/30")}>{entry.eyebrow}</span>
                      <span className={cn("mt-0.5 block text-xs font-semibold leading-snug", active ? "text-[#f6ead3]" : "text-white/55")}>{entry.title}</span>
                    </span>
                  </button>
                );
              })}
            </nav>

            <section className="styled-scrollbar relative overflow-y-auto bg-black/15 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:overflow-visible lg:border-t lg:border-white/8 lg:px-6 lg:py-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-300/65">{chapter.eyebrow}</div>
                  <div className="mt-1 text-[11px] text-stone-500">{chapter.duration}</div>
                </div>
                <div className="text-[10px] font-semibold tabular-nums text-stone-500">{chapterIndex + 1} / {ONYXIA_GUIDE.chapters.length}</div>
              </div>
              <h2 className="mt-2 font-serif text-lg font-bold leading-tight text-[#f6ead3] lg:mt-3 lg:text-xl">{chapter.title}</h2>
              <p className="mt-1.5 text-[11px] leading-relaxed text-stone-400 lg:mt-2 lg:text-xs">{chapter.summary}</p>
              <ul className="mt-3 hidden space-y-2 lg:block">
                {chapter.objectives.map((objective) => (
                  <li key={objective} className="flex gap-2 text-[11px] leading-relaxed text-stone-300">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-300" />
                    {objective}
                  </li>
                ))}
              </ul>
              <div className="mt-3 lg:mt-4"><ExampleSwitch value={example} onChange={setExample} /></div>
              <div className="mt-3 grid grid-cols-[40px_1fr_40px] items-center gap-2 lg:mt-4">
                <button type="button" onClick={previous} disabled={chapterIndex === 0} aria-label="Previous chapter" className="grid h-9 place-items-center rounded border border-white/10 text-white/55 enabled:hover:bg-white/5 enabled:hover:text-white disabled:opacity-20">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex justify-center gap-1.5">
                  {ONYXIA_GUIDE.chapters.map((entry, index) => (
                    <button key={entry.id} type="button" aria-label={`Go to chapter ${index + 1}`} onClick={() => setChapterIndex(index)} className={cn("h-1.5 rounded-full transition-all", index === chapterIndex ? "w-7 bg-amber-300" : "w-1.5 bg-white/15 hover:bg-white/35")} />
                  ))}
                </div>
                <button type="button" onClick={next} disabled={chapterIndex === ONYXIA_GUIDE.chapters.length - 1} aria-label="Next chapter" className="grid h-9 place-items-center rounded border border-white/10 text-white/55 enabled:hover:bg-white/5 enabled:hover:text-white disabled:opacity-20">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </section>
          </aside>

          <section className="flex h-full min-h-0 flex-col">
            <GuideMap chapterIndex={chapterIndex} example={example} />
          </section>
        </div>
      </main>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Instance/Map/Guides/Onyxia",
  component: OnyxiaGuidePrototype,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof OnyxiaGuidePrototype>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractiveGuide: Story = {};
