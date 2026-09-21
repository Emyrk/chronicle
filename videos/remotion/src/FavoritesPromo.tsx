import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Check, ChevronDown, Shield, Star, UserRound, UsersRound } from "lucide-react";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const sceneOpacity = (frame: number, duration: number) =>
  interpolate(frame, [0, 18, duration - 18, duration], [0, 1, 1, 0], clamp);

function Brand() {
  return (
    <div className="absolute left-12 top-9 flex items-center gap-3">
      <Img src={staticFile("c/chronicle/ChronicleIcon.png")} className="size-11" />
      <span className="font-wow text-2xl tracking-wide text-white">Chronicle</span>
    </div>
  );
}

function Backdrop() {
  return (
    <AbsoluteFill className="overflow-hidden bg-[#070b12] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(21,151,242,0.18),transparent_38%),radial-gradient(circle_at_82%_78%,rgba(246,196,83,0.13),transparent_36%)]" />
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/60 to-transparent" />
    </AbsoluteFill>
  );
}

function Pill({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-base text-zinc-300 shadow-lg backdrop-blur">
      {icon}
      {children}
    </div>
  );
}

function IntroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 18, stiffness: 95 }, durationInFrames: 38 });
  const star = spring({ frame: frame - 34, fps, config: { damping: 12, stiffness: 120 }, durationInFrames: 32 });

  return (
    <AbsoluteFill style={{ opacity: sceneOpacity(frame, 165) }}>
      <Brand />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div
          className="mb-7 grid size-24 place-items-center rounded-3xl border border-amber-300/30 bg-amber-300/10 shadow-[0_0_70px_rgba(246,196,83,.22)]"
          style={{ scale: star, rotate: `${interpolate(star, [0, 1], [-18, 0])}deg` }}
        >
          <Star className="size-12 fill-amber-300 text-amber-300" />
        </div>
        <h1
          className="max-w-4xl font-wow text-[76px] leading-[0.98] tracking-tight"
          style={{
            opacity: entrance,
            translate: `0 ${interpolate(entrance, [0, 1], [34, 0])}px`,
          }}
        >
          Your favorites.<br />Always one click away.
        </h1>
        <p
          className="mt-7 text-2xl text-zinc-400"
          style={{ opacity: interpolate(frame, [32, 58], [0, 1], clamp) }}
        >
          Save the guilds and players you follow across Chronicle.
        </p>
        <div
          className="mt-9 flex gap-3"
          style={{ opacity: interpolate(frame, [52, 78], [0, 1], clamp) }}
        >
          <Pill icon={<Shield className="size-4 text-amber-300" />}>Favorite guilds</Pill>
          <Pill icon={<UserRound className="size-4 text-sky-400" />}>Favorite players</Pill>
          <Pill icon={<Check className="size-4 text-emerald-400" />}>Synced to your account</Pill>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function PlayerHeader() {
  return (
    <div className="rounded-xl border border-zinc-700 bg-[#101318] p-7 shadow-2xl">
      <div className="flex items-center gap-5">
        <div className="size-20 rounded-xl bg-[#123556] shadow-inner" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span className="font-wow text-4xl text-[#168ff0]">Welfs</span>
            <Star className="size-7 fill-amber-300 text-amber-300" />
          </div>
          <div className="mt-2 text-lg text-zinc-400">&lt;Cleave&gt; · 60 Restoration Shaman</div>
        </div>
      </div>
      <div className="mt-7 flex gap-2 border-b border-zinc-700 pb-3 text-sm">
        <span className="border-b-2 border-sky-400 px-4 pb-3 text-sky-400">Overview</span>
        <span className="px-4 pb-3 text-zinc-500">Gear</span>
        <span className="px-4 pb-3 text-zinc-500">Parses</span>
      </div>
    </div>
  );
}

function FavoriteActionScene() {
  const frame = useCurrentFrame();
  const cursorX = interpolate(frame, [15, 58, 90, 130], [1030, 790, 790, 960], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const cursorY = interpolate(frame, [15, 58, 90, 130], [620, 285, 285, 565], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const clicked = frame >= 64;
  const toastIn = spring({ frame: frame - 72, fps: 30, config: { damping: 18 }, durationInFrames: 24 });

  return (
    <AbsoluteFill style={{ opacity: sceneOpacity(frame, 170) }}>
      <Brand />
      <div className="absolute left-20 top-32 w-[770px]" style={{ scale: 0.98 }}>
        <PlayerHeader />
      </div>
      <div className="absolute right-16 top-40 w-[310px]">
        <div className="text-sm font-semibold uppercase tracking-[.24em] text-amber-300">One simple action</div>
        <h2 className="mt-4 font-wow text-5xl leading-tight">Star any player you want to follow.</h2>
        <p className="mt-5 text-xl leading-relaxed text-zinc-400">A clean, borderless control sits right beside their name.</p>
      </div>
      {clicked && (
        <div
          className="absolute bottom-16 right-16 flex w-[390px] items-center gap-3 rounded-xl border border-emerald-400/30 bg-[#102119] px-5 py-4 text-lg shadow-2xl"
          style={{ opacity: toastIn, translate: `${interpolate(toastIn, [0, 1], [30, 0])}px 0` }}
        >
          <span className="grid size-8 place-items-center rounded-full bg-emerald-400/15 text-emerald-400"><Check className="size-5" /></span>
          Welfs added to favorites
        </div>
      )}
      <div
        className="absolute z-20"
        style={{ left: cursorX, top: cursorY, scale: frame >= 58 && frame < 66 ? 0.82 : 1 }}
      >
        <div className="size-0 border-x-[10px] border-b-0 border-t-[24px] border-x-transparent border-t-white drop-shadow-xl" style={{ rotate: "-35deg" }} />
      </div>
    </AbsoluteFill>
  );
}

const favorites = [
  { kind: "guild", name: "Cleave", meta: "Nordanaar", icon: "shield" },
  { kind: "player", name: "Welfs", meta: "60 Shaman · Nordanaar", icon: "class_shaman.png" },
  { kind: "player", name: "Saelene", meta: "60 Priest · Tel'Abim", icon: "class_priest.png" },
];

function FavoriteRow({ item, delay, frame }: { item: (typeof favorites)[number]; delay: number; frame: number }) {
  const enter = spring({ frame: frame - delay, fps: 30, config: { damping: 20 }, durationInFrames: 25 });
  return (
    <div
      className="flex items-center gap-3 rounded-lg px-3 py-3"
      style={{ opacity: enter, translate: `${interpolate(enter, [0, 1], [18, 0])}px 0` }}
    >
      {item.icon === "shield" ? (
        <div className="grid size-11 place-items-center rounded-lg border border-zinc-700 bg-zinc-800"><Shield className="size-5 text-amber-300" /></div>
      ) : (
        <Img src={staticFile(`c/icons/${item.icon}`)} className="size-10 rounded-lg border border-zinc-700" />
      )}
      <div>
        <div className={`text-lg font-semibold ${item.kind === "guild" ? "text-amber-300" : item.name === "Welfs" ? "text-sky-400" : "text-white"}`}>{item.name}</div>
        <div className="text-sm text-zinc-500">{item.meta}</div>
      </div>
    </div>
  );
}

function QuickAccessScene() {
  const frame = useCurrentFrame();
  const menu = spring({ frame: frame - 12, fps: 30, config: { damping: 18 }, durationInFrames: 28 });
  return (
    <AbsoluteFill style={{ opacity: sceneOpacity(frame, 180) }}>
      <Brand />
      <div className="absolute left-16 top-32 w-[500px]">
        <div className="text-sm font-semibold uppercase tracking-[.24em] text-sky-400">Built into your workflow</div>
        <h2 className="mt-4 font-wow text-6xl leading-[1.04]">Jump back in from anywhere.</h2>
        <p className="mt-6 max-w-md text-xl leading-relaxed text-zinc-400">Your favorites appear in the Account menu and on the Characters settings page.</p>
        <div className="mt-8 flex items-center gap-3 text-lg text-zinc-300"><Check className="size-5 text-emerald-400" /> Guilds and players grouped together</div>
        <div className="mt-3 flex items-center gap-3 text-lg text-zinc-300"><Check className="size-5 text-emerald-400" /> Direct links to guild and armory pages</div>
      </div>
      <div
        className="absolute right-20 top-24 w-[470px] overflow-hidden rounded-2xl border border-zinc-700 bg-[#101318] shadow-[0_30px_90px_rgba(0,0,0,.55)]"
        style={{ opacity: menu, translate: `0 ${interpolate(menu, [0, 1], [-22, 0])}px` }}
      >
        <div className="flex items-center justify-between border-b border-zinc-700 px-6 py-5">
          <div className="flex items-center gap-3"><UsersRound className="size-5 text-zinc-400" /><span className="text-lg font-semibold">Account</span></div>
          <ChevronDown className="size-5 text-zinc-500" />
        </div>
        <div className="px-5 py-4">
          <div className="mb-2 flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-[.18em] text-zinc-500"><Star className="size-4 fill-amber-300 text-amber-300" /> Favorites</div>
          {favorites.map((item, index) => <FavoriteRow key={item.name} item={item} delay={35 + index * 18} frame={frame} />)}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function FinaleScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 18 }, durationInFrames: 34 });
  const pulse = interpolate(frame, [55, 75, 95], [1, 1.12, 1], { ...clamp, easing: Easing.inOut(Easing.ease) });
  return (
    <AbsoluteFill style={{ opacity: interpolate(frame, [0, 18], [0, 1], clamp) }}>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <Img
          src={staticFile("c/chronicle/ChronicleLogoCenter.svg")}
          className="mb-10 w-[420px]"
          style={{ opacity: entrance, scale: interpolate(entrance, [0, 1], [0.9, 1]) }}
        />
        <h2 className="font-wow text-6xl">Follow what matters.</h2>
        <p className="mt-5 text-2xl text-zinc-400">Favorites are now available on Chronicle.</p>
        <div className="mt-9 flex items-center gap-3 rounded-full border border-amber-300/30 bg-amber-300/10 px-6 py-3 text-xl text-amber-200" style={{ scale: pulse }}>
          <Star className="size-6 fill-amber-300 text-amber-300" />
          Find a guild or player. Tap the star.
        </div>
      </div>
      <div className="absolute bottom-8 inset-x-0 text-center text-sm uppercase tracking-[.28em] text-zinc-600">chronicle.game</div>
    </AbsoluteFill>
  );
}

export default function FavoritesPromo() {
  return (
    <AbsoluteFill>
      <Backdrop />
      <Sequence durationInFrames={165}><IntroScene /></Sequence>
      <Sequence from={145} durationInFrames={170}><FavoriteActionScene /></Sequence>
      <Sequence from={295} durationInFrames={180}><QuickAccessScene /></Sequence>
      <Sequence from={455} durationInFrames={165}><FinaleScene /></Sequence>
    </AbsoluteFill>
  );
}
