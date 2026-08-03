import { PlayerMetricChartAbilityBreakdownDemo } from "../../../frontend/chronicle/src/components/ui/PlayerMetricChart/PlayerMetricChart.demo";
import {
  AbsoluteFill,
  Composition,
  Easing,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const Cursor = ({ x, y, clicking }: { x: number; y: number; clicking: number }) => (
  <div style={{ position: "absolute", left: x, top: y, width: 34, height: 42, zIndex: 220 }}>
    <div
      className="border-primary"
      style={{
        position: "absolute",
        left: -13,
        top: -13,
        width: 50,
        height: 50,
        borderRadius: 999,
        borderWidth: 3,
        opacity: clicking,
        scale: interpolate(clicking, [0, 1], [0.45, 1.15]),
      }}
    />
    <svg viewBox="0 0 32 40" width="32" height="40" style={{ filter: "drop-shadow(0 4px 5px rgba(0,0,0,.65))" }}>
      <path d="M3 2L27 23H16L12 36L6 33L10 21H3V2Z" fill="white" stroke="black" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  </div>
);

const DamageDoneBreakoutVideo = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pinned = frame >= 112;
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });
  const cursorX = interpolate(frame, [20, 92], [1110, 540], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const cursorY = interpolate(frame, [20, 92], [590, 342], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const clickPulse = interpolate(frame, [100, 106, 116], [0, 1, 0], clamp);
  const instructionOpacity = interpolate(frame, [8, 18, 218, 232], [0, 1, 1, 0], clamp);

  return (
    <AbsoluteFill className="dark overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_22%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent_38%)]" />
      <header
        className="absolute left-[72px] top-[42px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [18, 0])}px` }}
      >
        <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-primary">Chronicle quick tip</p>
        <h1 className="font-display mt-1 text-[42px] font-bold tracking-tight">Open a Damage Done breakout</h1>
      </header>

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <PlayerMetricChartAbilityBreakdownDemo
          pinnedPlayerId={pinned ? "player-4" : undefined}
          classIconBasePath={staticFile("c/icons")}
        />
      </main>

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <div
        className="absolute bottom-12 left-[72px] flex items-center gap-4"
        style={{ opacity: instructionOpacity }}
      >
        <div className="grid h-12 w-12 place-items-center rounded-full bg-primary font-display text-xl font-bold text-primary-foreground shadow-lg">
          {pinned ? "2" : "1"}
        </div>
        <p className="font-display text-[32px] font-bold tracking-tight">
          {pinned ? "The real breakout is now pinned and draggable" : "Click a player row to pin its ability breakout"}
        </p>
      </div>
    </AbsoluteFill>
  );
};

export const DamageDoneBreakoutComposition = () => (
  <Composition
    id="DamageDoneBreakout"
    component={DamageDoneBreakoutVideo}
    durationInFrames={240}
    fps={30}
    width={1280}
    height={720}
  />
);
