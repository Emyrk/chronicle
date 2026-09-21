import { ChartSpline, Compass, MousePointer2, Shirt, Sparkles, Swords, Trophy, Users } from "lucide-react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame } from "remotion";
import { Brand, clamp, sceneOpacity } from "./shared";

const menuItems = [
  { label: "Armory", icon: Swords },
  { label: "Rankings", icon: Trophy },
  { label: "Performance", icon: ChartSpline },
  { label: "Census", icon: Users },
  { label: "Talent Builder", icon: Sparkles },
  { label: "Gear Builder", icon: Shirt },
];

export function MenuScene() {
  const frame = useCurrentFrame();
  const menuOpen = frame >= 42;
  const clicked = frame >= 112;
  const menuEntrance = spring({ frame: frame - 42, fps: 30, config: { damping: 18 }, durationInFrames: 24 });
  const cursorX = interpolate(frame, [8, 32, 62, 104, 122], [1100, 940, 940, 914, 914], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const cursorY = interpolate(frame, [8, 32, 62, 104, 122], [620, 95, 95, 260, 260], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const confirmation = spring({ frame: frame - 122, fps: 30, config: { damping: 18 }, durationInFrames: 24 });

  return (
    <AbsoluteFill style={{ opacity: sceneOpacity(frame, 170) }}>
      <Brand />
      <div className="absolute left-16 top-36 w-[420px]">
        <div className="text-sm font-semibold uppercase tracking-[.24em] text-sky-400">Find it in Chronicle</div>
        <h2 className="mt-4 font-wow text-[62px] leading-[1.02]">Open Explore.<br />Choose Performance.</h2>
        <p className="mt-6 max-w-sm text-xl leading-relaxed text-zinc-400">The full Performance History workspace is one click below Rankings.</p>
        <div
          className="mt-8 flex items-center gap-3 text-lg text-emerald-300"
          style={{ opacity: confirmation, translate: `${interpolate(confirmation, [0, 1], [18, 0])}px 0` }}
        >
          <ChartSpline className="size-5" /> Performance History opens
        </div>
      </div>

      <div className="absolute right-14 top-20 h-[550px] w-[680px] overflow-hidden rounded-2xl border border-white/10 bg-[#090e16] shadow-[0_32px_100px_rgba(0,0,0,.62)]">
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-6">
          <div className="flex items-center gap-5 text-sm text-zinc-500">
            <span>Recent</span>
            <span
              className={`flex items-center gap-2 rounded-md px-3 py-2 ${menuOpen ? "bg-white/[0.07] text-white" : ""}`}
            >
              <Compass className="size-4 text-sky-400" /> Explore
            </span>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-500">Account</div>
        </div>
        <div className="absolute inset-x-0 top-16 h-px bg-gradient-to-r from-transparent via-sky-400/30 to-transparent" />
        <div className="grid h-[486px] place-items-center text-center">
          <div>
            <ChartSpline className="mx-auto size-20 text-sky-400/15" />
            <div className="mt-4 font-wow text-4xl text-zinc-700">Explore Chronicle</div>
          </div>
        </div>

        {menuOpen && (
          <div
            className="absolute right-32 top-14 w-[230px] overflow-hidden rounded-xl border border-white/10 bg-[#111722] p-1.5 shadow-[0_24px_70px_rgba(0,0,0,.7)]"
            style={{ opacity: menuEntrance, translate: `0 ${interpolate(menuEntrance, [0, 1], [-12, 0])}px`, scale: interpolate(menuEntrance, [0, 1], [0.96, 1]) }}
          >
            {menuItems.map(({ label, icon: Icon }) => {
              const active = label === "Performance" && frame >= 84;
              return (
                <div
                  key={label}
                  className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm ${active ? "bg-sky-400/15 text-sky-200" : "text-zinc-400"}`}
                >
                  <Icon className={`size-4 ${active ? "text-sky-400" : "text-zinc-500"}`} />
                  <span className={active ? "font-semibold" : ""}>{label}</span>
                  {label === "Performance" && <span className="ml-auto text-[10px] uppercase tracking-wider text-sky-400">New</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <MousePointer2
        className="absolute z-30 size-8 fill-white text-zinc-900 drop-shadow-xl"
        style={{
          left: cursorX,
          top: cursorY,
          scale: (frame >= 34 && frame < 43) || (frame >= 106 && frame < 114) ? 0.78 : 1,
          rotate: "-12deg",
          opacity: clicked ? interpolate(frame, [112, 140], [1, 0], clamp) : 1,
        }}
      />
    </AbsoluteFill>
  );
}
