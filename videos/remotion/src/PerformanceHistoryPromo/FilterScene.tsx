import { CalendarDays, Check, MousePointer2, Share2, SlidersHorizontal } from "lucide-react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame } from "remotion";
import { AppWindow, Brand, SpecShape, clamp, sceneOpacity } from "./shared";

const filters = ["Patchwerk", "Thaddius", "Kel'Thuzad"];

export function FilterScene() {
  const frame = useCurrentFrame();
  const clicked = frame >= 68;
  const cursorX = interpolate(frame, [12, 50, 68, 116], [1060, 716, 716, 1040], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const cursorY = interpolate(frame, [12, 50, 68, 116], [620, 209, 209, 575], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const tooltip = spring({ frame: frame - 78, fps: 30, config: { damping: 18 }, durationInFrames: 24 });

  return (
    <AbsoluteFill style={{ opacity: sceneOpacity(frame, 180) }}>
      <Brand />
      <AppWindow className="absolute left-12 top-24 w-[810px]">
        <div className="p-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <div className="text-lg font-semibold">Performance History</div>
              <div className="text-xs text-zinc-500">Choose exactly what belongs in the comparison.</div>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-400"><Share2 className="size-4 text-emerald-400" /> Shareable URL</div>
          </div>
          <div className="grid grid-cols-[210px_1fr] gap-5 pt-5">
            <div className="space-y-5 border-r border-white/10 pr-5">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500"><CalendarDays className="size-3.5" /> Date range</div>
                <div className="grid grid-cols-3 gap-1 rounded-lg border border-white/10 bg-black/20 p-1 text-center text-xs">
                  <span className="py-1.5 text-zinc-500">30d</span>
                  <span className="rounded-md bg-white/10 py-1.5 text-white">60d</span>
                  <span className="py-1.5 text-zinc-500">180d</span>
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500"><SlidersHorizontal className="size-3.5" /> Encounters</div>
                <div className="space-y-1.5">
                  {filters.map((filter) => (
                    <div key={filter} className="flex items-center gap-2 rounded-md bg-white/[0.04] px-3 py-2 text-xs text-zinc-300">
                      <span className="grid size-4 place-items-center rounded border border-sky-400/50 bg-sky-400/15"><Check className="size-3 text-sky-300" /></span>
                      {filter}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <span className="rounded-md border border-pink-400/50 bg-pink-400/10 px-3 py-2 text-xs font-semibold text-pink-300">Voxii</span>
                  <span className="rounded-md border border-sky-400/50 bg-sky-400/10 px-3 py-2 text-xs font-semibold text-sky-300">Welfs</span>
                </div>
                <div className="flex rounded-lg border border-white/10 bg-black/20 p-1 text-xs">
                  <span className={`rounded-md px-3 py-1.5 ${clicked ? "text-zinc-500" : "bg-white/10 text-white"}`}>Raw</span>
                  <span className={`rounded-md px-3 py-1.5 ${clicked ? "bg-white/10 text-white" : "text-zinc-500"}`}>Parse</span>
                </div>
              </div>
              <div className="mt-5 rounded-xl border border-white/10 bg-[#080c13] p-5">
                <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">Voxii · All specs</div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["Protection", "circle" as const],
                    ["Unknown", "diamond" as const],
                    ["Retribution", "square" as const],
                  ].map(([spec, shape]) => (
                    <div key={spec} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm">
                      <SpecShape shape={shape} color="#f472b6" size={13} />
                      <span>{spec}</span>
                    </div>
                  ))}
                </div>
                {clicked && (
                  <div className="mt-5 flex items-center justify-between rounded-lg border border-violet-400/20 bg-violet-400/[0.07] px-4 py-3">
                    <span className="text-sm text-zinc-300">Parse mode colors every result by percentile.</span>
                    <div className="flex gap-1.5">{["#9ca3af", "#22c55e", "#3b82f6", "#a855f7", "#f97316", "#facc15"].map((color) => <span key={color} className="size-3 rounded-full" style={{ backgroundColor: color }} />)}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </AppWindow>

      <div className="absolute right-12 top-36 w-[340px]">
        <div className="text-sm font-semibold uppercase tracking-[.24em] text-violet-400">Your exact view</div>
        <h2 className="mt-4 font-wow text-[56px] leading-[1.02]">Filter the story you want to tell.</h2>
        <p className="mt-6 text-xl leading-relaxed text-zinc-400">Switch DPS or HPS, raw output or parses, date ranges, encounters, specs, and subspecs.</p>
        <div className="mt-7 flex items-center gap-3 text-lg text-emerald-300" style={{ opacity: tooltip, translate: `${interpolate(tooltip, [0, 1], [18, 0])}px 0` }}>
          <Share2 className="size-5" /> Every choice stays in the link.
        </div>
      </div>

      <MousePointer2
        className="absolute z-30 size-8 fill-white text-zinc-900 drop-shadow-xl"
        style={{ left: cursorX, top: cursorY, scale: frame >= 58 && frame < 68 ? 0.78 : 1, rotate: "-12deg" }}
      />
    </AbsoluteFill>
  );
}
