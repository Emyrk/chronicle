import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import type { SceneOperation } from "../protocol";
import { UI_ROOT_ID } from "../protocol";
import { loadGuidePackage } from "../package";
import { browserGuideRuntimeFactory } from "../runtimeFactory";
import { GuideHost } from "./GuideHost";
import type { GuideMapRenderProps, GuidePackageLike, GuideResolvedMap, GuideRuntimeFactory } from "./types";

const guide: GuidePackageLike = {
  manifest: {
    id: "storybook.dragon-briefing",
    name: "Dragonflight Briefing",
    entrypoint: "main.lua",
    map_id: 249,
    capabilities: ["ui", "map", "input"],
    assets: [],
    description: "A browser-only fake guide runtime for host development.",
  },
  read: () => new Uint8Array(),
  readText: () => "",
};

const initialOperations: SceneOperation[] = [
  { op: "camera", x: 0.5, y: 0.5, zoom: 1.15 },
  { op: "create", id: "onyxia", kind: "unit", parentId: null, props: { x: 0.5, y: 0.36, size: 28, unit: "Creature-0-0-0-0-10184-0000000000", label: "Onyxia", role: "boss", color: "#ef4444", facing: Math.PI } },
  { op: "create", id: "tank", kind: "unit", parentId: null, props: { x: 0.5, y: 0.52, size: 20, unit: "Main tank", label: "Main tank", role: "tank", color: "#60a5fa", facing: 0 } },
  { op: "create", id: "safe", kind: "circle", parentId: null, props: { x: 0.5, y: 0.52, radius: 0.08, color: "#22c55e", width: 2 } },
  { op: "create", id: "breath", kind: "cone", parentId: null, props: { x: 0.5, y: 0.36, radius: 0.23, facing: Math.PI, angle: 0.8, color: "#f97316", width: 2 } },
  { op: "create", id: "panel", kind: "frame", parentId: UI_ROOT_ID, props: { x: 24, y: -28, width: 310, height: 174, anchor: "top-left", backgroundColor: "#08111eee", borderColor: "#d7a84b77", zIndex: 10 } },
  { op: "create", id: "title", kind: "text", parentId: "panel", props: { x: 18, y: -16, width: 274, height: 30, anchor: "top-left", text: "PHASE ONE · GROUND", fontSize: 16, color: "#fde68a", align: "left" } },
  { op: "create", id: "body", kind: "text", parentId: "panel", props: { x: 18, y: -52, width: 274, height: 68, anchor: "top-left", text: "Keep Onyxia facing north. Melee stack behind her wings; ranged fan out along the southern wall.", fontSize: 13, color: "#e2e8f0", align: "left" } },
  { op: "create", id: "next", kind: "button", parentId: "panel", props: { x: -18, y: 14, width: 112, height: 34, anchor: "bottom-right", text: "Next step", enabled: true, color: "#fef3c7", backgroundColor: "#78350fdd", borderColor: "#f59e0b" } },
  { op: "listen", id: "next", event: "click", enabled: true },
];

const runtimeFactory: GuideRuntimeFactory = (callbacks) => {
  let stopped = false;
  return {
    start() {
      queueMicrotask(() => {
        if (stopped) return;
        callbacks.onReady();
        callbacks.onBatch(initialOperations);
      });
    },
    stop() { stopped = true; },
    resize() {},
    event(event) {
      if (event.nodeId !== "next") return;
      callbacks.onBatch([
        { op: "set", id: "title", props: { text: "PHASE TWO · AIR" } },
        { op: "set", id: "body", props: { text: "Spread into lanes and keep the center clear. Collapse only after the deep breath passes." } },
        { op: "camera", x: 0.5, y: 0.46, zoom: 1.5 },
      ]);
    },
  };
};

const fakeMap: GuideResolvedMap = {
  ground: { iconBaseUrl: "", canvas: { floor: 0, width: 1000, height: 700, tileWidth: 0, tileHeight: 0, tiles: [] } },
  dungeonMesh: null,
  projectSample: (sample) => ({ leftPercent: sample.y * 100, topPercent: sample.x * 100 }),
  normalizedToWorld: (x, y) => ({ x: y, y: x }),
  normalizedRadiusToYards: (radius) => radius,
};

function StoryMap({ markers, planItems }: GuideMapRenderProps) {
  return (
    <div className="relative size-full overflow-hidden bg-[radial-gradient(ellipse_at_center,#334155_0%,#172033_42%,#070b12_75%)]">
      <div className="absolute inset-[12%] rounded-[48%] border border-amber-200/15 bg-[radial-gradient(circle_at_50%_42%,#2d384b,#111827_58%,#020617)] shadow-[inset_0_0_80px_rgba(0,0,0,.85)]" />
      {planItems.map((item) => item.kind === "circle" ? (
        <div key={item.id} className="absolute rounded-full border-2 border-emerald-400/70" style={{ left: "42%", top: "44%", width: "16%", aspectRatio: "1" }} />
      ) : item.kind === "cone" ? (
        <div key={item.id} className="absolute left-1/2 top-[36%] h-[30%] w-[24%] origin-top -translate-x-1/2 bg-gradient-to-b from-orange-400/40 to-transparent [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
      ) : null)}
      {markers.map((marker) => (
        <div key={marker.guid} className="absolute -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: `${marker.point.leftPercent}%`, top: `${marker.point.topPercent}%` }}>
          <div className="mx-auto size-5 rounded-full border-2 border-white/70 shadow-lg" style={{ backgroundColor: marker.color }} />
          <div className="mt-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">{marker.name}</div>
        </div>
      ))}
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function RealOnyxiaGuide() {
  const query = useQuery({
    queryKey: ["storybook-onyxia-guide"],
    queryFn: async () => {
      const response = await fetch("/guides/chronicle.onyxia.zip");
      if (!response.ok) throw new Error(`Guide package ${response.status}`);
      return await loadGuidePackage(await response.arrayBuffer());
    },
    retry: false,
  });
  if (query.isError) return <div role="alert">{query.error instanceof Error ? query.error.message : "Guide failed"}</div>;
  if (!query.data) return <div>Loading packaged guide…</div>;
  return (
    <GuideHost
      guide={query.data}
      runtimeFactory={browserGuideRuntimeFactory}
      iconBaseUrl="storybook://maps"
      mapResolver={async () => fakeMap}
      MapRenderer={StoryMap}
      onExit={() => undefined}
      className="h-screen min-h-[42rem]"
    />
  );
}

const meta = {
  title: "Guides/GuideHost",
  component: GuideHost,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <QueryClientProvider client={queryClient}><Story /></QueryClientProvider>],
} satisfies Meta<typeof GuideHost>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractiveBriefing: Story = {
  args: {
    guide,
    runtimeFactory,
    iconBaseUrl: "storybook://maps",
    mapResolver: async () => fakeMap,
    MapRenderer: StoryMap,
    onExit: () => undefined,
    className: "h-screen min-h-[42rem]",
  },
};

export const PackagedLuaOnyxia: Story = {
  render: () => <RealOnyxiaGuide />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Give every group a side")).toBeVisible();
    await userEvent.click(await canvas.findByRole("button", { name: "Next" }));
    await expect(await canvas.findByText("Flanks are safe; front and tail are not")).toBeVisible();
    await userEvent.click(await canvas.findByRole("button", { name: "Showing: Safe" }));
    await expect(await canvas.findByRole("button", { name: "Showing: Danger" })).toBeVisible();
  },
};
