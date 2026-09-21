import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame } from "remotion";
import { AppWindow, Brand, SpecShape, clamp, sceneOpacity, type PointShape } from "./shared";

const players = [
  { name: "Voxii", role: "Protection", color: "#f472b6", shape: "circle" as PointShape, points: "20,78 124,61 228,67 332,42 436,49 540,25" },
  { name: "Welfs", role: "Restoration", color: "#38bdf8", shape: "diamond" as PointShape, points: "20,88 124,74 228,50 332,61 436,31 540,38" },
  { name: "Saelene", role: "Shadow", color: "#a78bfa", shape: "square" as PointShape, points: "20,94 124,83 228,72 332,70 436,58 540,44" },
];

const pointSets = [
  [[20, 78], [124, 61], [228, 67], [332, 42], [436, 49], [540, 25]],
  [[20, 88], [124, 74], [228, 50], [332, 61], [436, 31], [540, 38]],
  [[20, 94], [124, 83], [228, 72], [332, 70], [436, 58], [540, 44]],
];

export function CompareScene() {
  const frame = useCurrentFrame();
  const panel = spring({ frame: frame - 8, fps: 30, config: { damping: 18 }, durationInFrames: 30 });
  const lineProgress = interpolate(frame, [32, 118], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });

  return (
    <AbsoluteFill style={{ opacity: sceneOpacity(frame, 190) }}>
      <Brand />
      <div className="absolute left-14 top-32 w-[370px]">
        <div className="text-sm font-semibold uppercase tracking-[.24em] text-sky-400">See the whole trend</div>
        <h2 className="mt-4 font-wow text-[58px] leading-[1.02]">Compare up to five players.</h2>
        <p className="mt-6 text-xl leading-relaxed text-zinc-400">Put every raid night on one timeline, with spec-aware shapes and player colors that stay easy to follow.</p>
      </div>

      <AppWindow className="absolute right-12 top-24 w-[790px]" >
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold">Performance History</div>
              <div className="text-xs text-zinc-500">Naxxramas · Last 60 days</div>
            </div>
            <div className="flex rounded-lg border border-white/10 bg-black/20 p-1 text-xs">
              <span className="rounded-md bg-red-500/20 px-3 py-1.5 text-red-300">DPS</span>
              <span className="px-3 py-1.5 text-zinc-500">HPS</span>
            </div>
          </div>
          <div className="mb-4 flex gap-2">
            {players.map((player, index) => (
              <div
                key={player.name}
                className="flex items-center gap-2 rounded-md border bg-black/20 px-3 py-2 text-xs"
                style={{ borderColor: `${player.color}88`, opacity: interpolate(frame, [18 + index * 10, 40 + index * 10], [0, 1], clamp) }}
              >
                <SpecShape shape={player.shape} color={player.color} size={10} />
                <span className="font-semibold" style={{ color: player.color }}>{player.name}</span>
                <span className="text-zinc-600">{player.role}</span>
              </div>
            ))}
          </div>
          <div className="relative h-[300px] overflow-hidden rounded-xl border border-white/10 bg-[#080c13] px-10 py-7" style={{ opacity: panel }}>
            <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,.07)_1px,transparent_1px)] [background-size:100%_62px]" />
            <svg className="absolute inset-x-10 top-7 h-[245px] w-[610px]" viewBox="0 0 560 110" preserveAspectRatio="none">
              {players.map((player) => (
                <polyline
                  key={player.name}
                  points={player.points}
                  fill="none"
                  stroke={player.color}
                  strokeWidth="2.2"
                  vectorEffect="non-scaling-stroke"
                  strokeDasharray="800"
                  strokeDashoffset={800 * (1 - lineProgress)}
                />
              ))}
            </svg>
            {players.flatMap((player, playerIndex) => pointSets[playerIndex].map(([x, y], pointIndex) => (
              <span
                key={`${player.name}-${pointIndex}`}
                className="absolute"
                style={{
                  left: 40 + x * (610 / 560),
                  top: 27 + y * (245 / 110),
                  opacity: interpolate(lineProgress, [pointIndex / 7, (pointIndex + 1) / 7], [0, 1], clamp),
                  scale: interpolate(lineProgress, [pointIndex / 7, (pointIndex + 1) / 7], [0.4, 1], clamp),
                }}
              >
                <SpecShape shape={player.shape} color={player.color} size={11} />
              </span>
            )))}
            <div className="absolute inset-x-10 bottom-3 flex justify-between text-[10px] text-zinc-600">
              <span>Jul 28</span><span>Aug 10</span><span>Aug 24</span><span>Sep 7</span><span>Sep 21</span>
            </div>
          </div>
        </div>
      </AppWindow>
    </AbsoluteFill>
  );
}
