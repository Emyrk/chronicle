import type { ReactNode } from "react";
import {
  AbsoluteFill,
  Composition,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const COLORS = {
  background: "#090b10",
  panel: "#11151d",
  panelRaised: "#171c26",
  border: "#293140",
  text: "#f5f7fb",
  muted: "#8d98aa",
  accent: "#e8b84e",
  mage: "#69ccf0",
  warlock: "#9482c9",
  rogue: "#fff569",
  warrior: "#c79c6e",
  priest: "#ffffff",
};

const players = [
  { rank: 1, name: "Frostweave", className: "Mage", value: 128540, percent: 100, color: COLORS.mage },
  { rank: 2, name: "Voidwhisper", className: "Warlock", value: 117820, percent: 91.7, color: COLORS.warlock },
  { rank: 3, name: "Backstabber", className: "Rogue", value: 103460, percent: 80.5, color: COLORS.rogue },
  { rank: 4, name: "Ironwall", className: "Warrior", value: 92110, percent: 71.7, color: COLORS.warrior },
  { rank: 5, name: "Dawnsong", className: "Priest", value: 78420, percent: 61, color: COLORS.priest },
];

const abilities = [
  { name: "Shadow Bolt", value: 52410, percent: 100, hits: 29, crits: 8 },
  { name: "Corruption", value: 28760, percent: 54.9, hits: 42, crits: 0 },
  { name: "Immolate", value: 19680, percent: 37.5, hits: 18, crits: 4 },
  { name: "Curse of Agony", value: 11240, percent: 21.4, hits: 31, crits: 0 },
  { name: "Searing Pain", value: 5730, percent: 10.9, hits: 5, crits: 1 },
];

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const formatNumber = (value: number) => value.toLocaleString("en-US");

const TutorialLabel = ({ children, visible, step }: { children: ReactNode; visible: number; step: string }) => (
  <div
    style={{
      position: "absolute",
      left: 72,
      bottom: 48,
      display: "flex",
      alignItems: "center",
      gap: 18,
      opacity: visible,
      color: COLORS.text,
    }}
  >
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 999,
        display: "grid",
        placeItems: "center",
        background: COLORS.accent,
        color: "#17120a",
        fontSize: 23,
        fontWeight: 800,
        boxShadow: "0 8px 28px rgba(232, 184, 78, 0.28)",
      }}
    >
      {step}
    </div>
    <div style={{ fontSize: 34, fontWeight: 720, letterSpacing: -0.7 }}>{children}</div>
  </div>
);

const PlayerRow = ({
  player,
  selected,
}: {
  player: (typeof players)[number];
  selected: boolean;
}) => (
  <div
    style={{
      height: 48,
      position: "relative",
      display: "flex",
      alignItems: "center",
      overflow: "hidden",
      borderRadius: 7,
      border: selected ? `2px solid ${COLORS.accent}` : "2px solid transparent",
      boxShadow: selected ? "0 0 0 2px rgba(232, 184, 78, 0.12) inset" : undefined,
    }}
  >
    <div
      style={{
        position: "absolute",
        inset: 0,
        width: `${player.percent}%`,
        background: `linear-gradient(90deg, rgba(0,0,0,.32), rgba(0,0,0,.12)), ${player.color}`,
        opacity: 0.78,
      }}
    />
    <div
      style={{
        position: "relative",
        zIndex: 1,
        width: "100%",
        display: "flex",
        alignItems: "center",
        padding: "0 14px",
        color: COLORS.text,
        fontSize: 18,
        fontWeight: 650,
        textShadow: "0 1px 2px rgba(0,0,0,.5)",
      }}
    >
      <span style={{ width: 42, fontVariantNumeric: "tabular-nums", opacity: 0.82 }}>#{player.rank}</span>
      <span
        style={{
          width: 24,
          height: 24,
          marginRight: 10,
          borderRadius: 5,
          display: "grid",
          placeItems: "center",
          background: "rgba(8, 10, 15, .72)",
          color: player.color,
          fontSize: 13,
          fontWeight: 900,
        }}
      >
        {player.className.slice(0, 1)}
      </span>
      <span>{player.name}</span>
      <span style={{ flex: 1 }} />
      <span style={{ width: 106, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatNumber(player.value)}</span>
      <span style={{ width: 78, textAlign: "right", opacity: 0.82 }}>{player.percent.toFixed(1)}%</span>
    </div>
  </div>
);

const DamagePanel = ({ selected }: { selected: boolean }) => (
  <div
    style={{
      position: "absolute",
      left: 72,
      top: 126,
      width: 650,
      height: 408,
      padding: 18,
      borderRadius: 14,
      background: COLORS.panel,
      border: `1px solid ${COLORS.border}`,
      boxShadow: "0 28px 80px rgba(0,0,0,.42)",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", height: 50, marginBottom: 10 }}>
      <div>
        <div style={{ color: COLORS.text, fontSize: 24, fontWeight: 760 }}>Damage Done</div>
        <div style={{ color: COLORS.muted, fontSize: 14, marginTop: 3 }}>Nefarian · 3:42</div>
      </div>
      <div style={{ flex: 1 }} />
      <div
        style={{
          padding: "7px 11px",
          borderRadius: 8,
          color: COLORS.muted,
          border: `1px solid ${COLORS.border}`,
          fontSize: 14,
        }}
      >
        Per Second
      </div>
    </div>
    <div style={{ display: "grid", gap: 7 }}>
      {players.map((player) => (
        <PlayerRow key={player.name} player={player} selected={selected && player.rank === 2} />
      ))}
    </div>
    <div style={{ display: "flex", marginTop: 14, color: COLORS.muted, fontSize: 14 }}>
      <span>Total raid damage</span>
      <span style={{ flex: 1 }} />
      <span style={{ color: COLORS.text, fontWeight: 700 }}>520,350</span>
    </div>
  </div>
);

const Breakout = ({ pinned, scale, opacity }: { pinned: boolean; scale: number; opacity: number }) => (
  <div
    style={{
      position: "absolute",
      left: 758,
      top: pinned ? 160 : 198,
      width: 450,
      height: 360,
      borderRadius: 13,
      overflow: "hidden",
      opacity,
      scale,
      transformOrigin: "top left",
      background: COLORS.panelRaised,
      border: `1px solid color-mix(in srgb, ${COLORS.warlock} 68%, transparent)`,
      boxShadow: pinned ? "0 30px 80px rgba(0,0,0,.58)" : "0 20px 55px rgba(0,0,0,.48)",
    }}
  >
    <div
      style={{
        height: 58,
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        borderBottom: `1px solid ${COLORS.border}`,
        color: COLORS.text,
      }}
    >
      {pinned ? <span style={{ color: COLORS.muted, fontSize: 20, marginRight: 12, letterSpacing: -2 }}>⋮⋮</span> : null}
      <span style={{ width: 10, height: 10, borderRadius: 999, background: COLORS.warlock, marginRight: 10 }} />
      <span style={{ fontSize: 18, fontWeight: 750 }}>Voidwhisper</span>
      <span style={{ marginLeft: 9, color: COLORS.muted, fontSize: 13 }}>Warlock</span>
      <span style={{ flex: 1 }} />
      {pinned ? (
        <>
          <span style={{ color: COLORS.muted, fontSize: 13, borderLeft: `1px solid ${COLORS.border}`, paddingLeft: 13 }}>
            Damage Done
          </span>
          <span style={{ marginLeft: 13, color: COLORS.muted, fontSize: 24 }}>×</span>
        </>
      ) : null}
    </div>
    <div style={{ display: "flex", height: 43, alignItems: "end", padding: "0 16px", borderBottom: `1px solid ${COLORS.border}` }}>
      <div style={{ height: 43, padding: "13px 12px 9px", color: COLORS.text, fontSize: 14, fontWeight: 720, borderBottom: `2px solid ${COLORS.warlock}` }}>
        By Ability
      </div>
      <div style={{ height: 43, padding: "13px 12px 9px", color: COLORS.muted, fontSize: 14 }}>By Target</div>
      <span style={{ flex: 1 }} />
      <div style={{ padding: "7px 0 10px", color: COLORS.muted, fontSize: 12 }}>117,820 Damage</div>
    </div>
    <div style={{ padding: "12px 14px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 88px 42px 42px", padding: "0 8px 7px", color: COLORS.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 }}>
        <span>Ability</span><span style={{ textAlign: "right" }}>Damage</span><span style={{ textAlign: "right" }}>Hit</span><span style={{ textAlign: "right" }}>Crit</span>
      </div>
      <div style={{ display: "grid", gap: 7 }}>
        {abilities.map((ability) => (
          <div key={ability.name} style={{ position: "relative", height: 39, borderRadius: 6, overflow: "hidden", background: "#10141b" }}>
            <div style={{ position: "absolute", inset: 0, width: `${ability.percent}%`, background: COLORS.warlock, opacity: 0.22 }} />
            <div style={{ position: "relative", zIndex: 1, height: "100%", display: "grid", gridTemplateColumns: "1fr 88px 42px 42px", alignItems: "center", padding: "0 8px", color: COLORS.text, fontSize: 13 }}>
              <span style={{ fontWeight: 650 }}>{ability.name}</span>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatNumber(ability.value)}</span>
              <span style={{ textAlign: "right", color: COLORS.muted }}>{ability.hits}</span>
              <span style={{ textAlign: "right", color: ability.crits ? COLORS.accent : COLORS.muted }}>{ability.crits}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const Cursor = ({ x, y, clicking }: { x: number; y: number; clicking: number }) => (
  <div style={{ position: "absolute", left: x, top: y, width: 34, height: 42, zIndex: 20 }}>
    <div
      style={{
        position: "absolute",
        left: -13,
        top: -13,
        width: 50,
        height: 50,
        borderRadius: 999,
        border: `3px solid ${COLORS.accent}`,
        opacity: clicking,
        scale: interpolate(clicking, [0, 1], [0.45, 1.15]),
      }}
    />
    <svg viewBox="0 0 32 40" width="32" height="40" style={{ filter: "drop-shadow(0 4px 5px rgba(0,0,0,.65))" }}>
      <path d="M3 2L27 23H16L12 36L6 33L10 21H3V2Z" fill="#fff" stroke="#11151d" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  </div>
);

const DamageDoneBreakoutVideo = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 34 });
  const cursorX = interpolate(frame, [18, 68], [1110, 560], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const cursorY = interpolate(frame, [18, 68], [590, 277], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const hoverOpacity = interpolate(frame, [68, 78, 124, 130], [0, 1, 1, 0], clamp);
  const hoverScale = interpolate(frame, [68, 82], [0.94, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const pinnedOpacity = interpolate(frame, [126, 138], [0, 1], clamp);
  const pinnedScale = spring({ frame: frame - 126, fps, config: { damping: 16, stiffness: 160, mass: 0.75 } });
  const clickPulse = interpolate(frame, [119, 124, 134], [0, 1, 0], clamp);

  const stepOne = interpolate(frame, [6, 16, 60, 70], [0, 1, 1, 0], clamp);
  const stepTwo = interpolate(frame, [70, 82, 116, 126], [0, 1, 1, 0], clamp);
  const stepThree = interpolate(frame, [132, 145, 218, 232], [0, 1, 1, 0], clamp);

  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 68% 28%, #1d2230 0%, ${COLORS.background} 48%)`, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 72, top: 44, color: COLORS.text, opacity: entrance }}>
        <div style={{ color: COLORS.accent, fontSize: 15, fontWeight: 800, letterSpacing: 2.2, textTransform: "uppercase" }}>Chronicle quick tip</div>
        <div style={{ fontSize: 42, fontWeight: 790, letterSpacing: -1.5, marginTop: 6 }}>Open a Damage Done breakout</div>
      </div>

      <div style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}>
        <DamagePanel selected={frame >= 119} />
      </div>

      {hoverOpacity > 0 ? <Breakout pinned={false} opacity={hoverOpacity} scale={hoverScale} /> : null}
      {pinnedOpacity > 0 ? <Breakout pinned opacity={pinnedOpacity} scale={pinnedScale} /> : null}

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <TutorialLabel visible={stepOne} step="1">Open the Damage Done panel</TutorialLabel>
      <TutorialLabel visible={stepTwo} step="2">Hover a player row to preview the breakout</TutorialLabel>
      <TutorialLabel visible={stepThree} step="3">Click the row to pin the breakout open</TutorialLabel>
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
