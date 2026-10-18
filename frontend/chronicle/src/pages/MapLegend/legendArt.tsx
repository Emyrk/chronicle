/* eslint-disable react-refresh/only-export-components -- The legend's art components share their hooks. */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  DEAD_RING,
  DEBUFF_PLANE,
  DISPEL_COLORS,
  DROP_LINE,
  ENEMY_RED,
  HALO_COLORS,
  MARKS_SCALE,
  TOKEN_ART_SIZE,
  TOKEN_LAYOUT,
  drawBossPin,
  drawCastArc,
  drawDebuffTint,
  drawDisc,
  drawFacingMarks,
  drawHalo,
  drawShadow,
  drawSigil,
  drawSigilTicks,
  type DispelKind,
  type HaloKind,
} from "@/pages/Instance/EventsPanels/Map/unitTokenArt";
import { hexCss } from "@/pages/Instance/EventsPanels/Map/mapPalette";

/**
 * The map legend's token art: the 3D map's own canvas drawing (unitTokenArt),
 * stacked the way MapScene3D stacks its planes, on a tilted card so it reads
 * as lying on the ground. Only the 3D bits (the edge, the tilt) are imitated.
 */

/** Seconds since mount, updated every frame: drives the legend's animations. */
export function useClock(): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setSeconds((now - start) / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return seconds;
}

const resolvedColors = new Map<string, string>();

/** A CSS colour (custom properties resolved), for canvas drawing. */
export function useCssColor(color: string): string {
  const variable = /^var\((--[^)]+)\)$/.exec(color)?.[1];
  if (!variable) return color;
  let resolved = resolvedColors.get(variable);
  if (resolved === undefined) {
    resolved = getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || "#ffffff";
    resolvedColors.set(variable, resolved);
  }
  return resolved;
}

function useImage(url: string | null): HTMLImageElement | null {
  const [loaded, setLoaded] = useState<{ url: string; image: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (!url) return;
    const element = new Image();
    element.onload = () => setLoaded({ url, image: element });
    element.src = url;
    return () => {
      element.onload = null;
    };
  }, [url]);
  return loaded && loaded.url === url ? loaded.image : null;
}

/** One art canvas, redrawn whenever `draw` changes. */
function ArtCanvas({ draw, style, className }: { draw: (context: CanvasRenderingContext2D) => void; style?: CSSProperties; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = ref.current?.getContext("2d");
    if (!context) return;
    context.reset();
    draw(context);
  }, [draw]);
  return <canvas ref={ref} width={TOKEN_ART_SIZE} height={TOKEN_ART_SIZE} aria-hidden className={className} style={style} />;
}

// A square layer `half` radii either side of the token's centre.
function layer(radiusPx: number, half: number, extra?: CSSProperties): CSSProperties {
  const size = radiusPx * half * 2;
  return { position: "absolute", left: -size / 2, top: -size / 2, width: size, height: size, ...extra };
}

export interface TokenProps {
  kind?: "player" | "pet" | "hostile";
  /** Icon URL (players: spec, else class). */
  icon?: string | null;
  /** Ring colour; a class colour, possibly `var(--color-class-…)`. */
  ring?: string;
  dead?: boolean;
  /** Degrees clockwise from up. */
  facing?: number;
  halo?: HaloKind | null;
  pinned?: boolean;
  /** Cast progress (0-1) and its school colour, or null when idle. */
  cast?: { fraction: number; color: string } | null;
  /** A debuff's dispel type, tinting the token. */
  dispel?: DispelKind | null;
  /** Above the token: a column this full (0-1) in this colour, and optionally a thinner power column beside it. */
  column?: { value: number; color: string; power?: { value: number; color: string } } | null;
  muted?: boolean;
  /** Pixels per geometry unit. */
  scale?: number;
  /** Degrees the ground card is tilted back. */
  tilt?: number;
  /** In the air: pixels the token floats above its shadow, joined to it by the drop line. */
  lift?: number;
}

/** A unit token as the 3D map draws it, centred on its container's origin. */
export function Token({
  kind = "player",
  icon = null,
  ring = "var(--color-class-mage)",
  dead = false,
  facing = 0,
  halo = null,
  pinned = false,
  cast = null,
  column = null,
  dispel = null,
  muted = false,
  scale = 22,
  tilt = 58,
  lift = 0,
}: TokenProps) {
  const radius = TOKEN_LAYOUT.radius[kind] * scale;
  const ringColor = useCssColor(ring);
  const castColor = useCssColor(cast?.color ?? "#fff");
  const image = useImage(icon);
  const plane = TOKEN_LAYOUT.plane;
  const shownRing = dead ? DEAD_RING : ringColor;
  const thickness = Math.max(2, Math.round(radius * 2 * TOKEN_LAYOUT.thickness));
  const castStep = cast ? cast.fraction : 0;
  const tilted = { position: "absolute", left: 0, top: 0, transform: `perspective(600px) rotateX(${tilt}deg)`, transformStyle: "preserve-3d" } as const;
  const shadow = <ArtCanvas draw={drawShadowLayer} style={layer(radius, plane.shadow)} />;
  const lineWidth = Math.max(1.5, DROP_LINE.width * scale);
  return (
    <div className="relative h-0 w-0" style={{ opacity: muted ? TOKEN_LAYOUT.mutedOpacity : 1 }}>
      {lift > 0 && (
        <>
          <div style={tilted}>{shadow}</div>
          <div style={{ position: "absolute", left: -lineWidth / 2, top: -lift, width: lineWidth, height: lift, background: DROP_LINE.color, opacity: DROP_LINE.opacity }} />
        </>
      )}
      <div style={{ position: "absolute", left: 0, top: -lift }}>
      <div style={tilted}>
        {lift > 0 ? null : shadow}
        {/* The coin edge: the ring colour shaded 65% → 35% down its thickness (drawEdge). */}
        {Array.from({ length: thickness }, (_, index) => (
          <div
            key={index}
            style={layer(radius, 1, {
              borderRadius: "50%",
              background: shownRing,
              boxShadow: `inset 0 0 0 999px rgba(0,0,0,${(0.35 + (index / thickness) * 0.3).toFixed(2)})`,
              transform: `translateZ(${thickness - index}px)`,
            })}
          />
        ))}
        <div style={{ position: "absolute", transform: `translateZ(${thickness}px)`, transformStyle: "preserve-3d" }}>
          <ArtCanvas key={`${image?.src}|${shownRing}|${dead}`} draw={(context) => drawDisc(context, { image, ring: ringColor, dead, well: kind === "hostile" ? "enemy" : kind === "pet" ? "guardian" : null })} style={layer(radius, 1)} />
          <ArtCanvas
            key={`marks|${shownRing}`}
            draw={(context) => drawFacingMarks(context, shownRing, false)}
            style={layer(radius, MARKS_SCALE, { transform: `rotate(${facing}deg)` })}
          />
          {dispel && !dead && (
            <ArtCanvas key={`debuff|${dispel}`} draw={(context) => drawDebuffTint(context, DISPEL_COLORS[dispel])} style={layer(radius, DEBUFF_PLANE)} />
          )}
          {cast && (
            <ArtCanvas key={`arc|${castStep.toFixed(2)}|${castColor}`} draw={(context) => drawCastArc(context, castStep, castColor)} style={layer(radius, plane.arc)} />
          )}
          {halo && <ArtCanvas key={halo} draw={(context) => drawHalo(context, halo, hexCss(HALO_COLORS[halo]))} style={layer(radius, plane.halo)} />}
          {pinned && <ArtCanvas key="pin" draw={drawPinnedLayer} style={layer(radius, plane.pin)} />}
        </div>
      </div>
      {column && <Columns column={column} radius={radius} />}
      </div>
    </div>
  );
}

function drawShadowLayer(context: CanvasRenderingContext2D) {
  context.scale(TOKEN_ART_SIZE / 64, TOKEN_ART_SIZE / 64);
  drawShadow(context);
}

function drawPinnedLayer(context: CanvasRenderingContext2D) {
  drawHalo(context, "pinned", hexCss(HALO_COLORS.pinned));
}

// The columns above the token, standing up off the disc (not tilted): health,
// and the thinner, shorter power column beside it, centred as a pair (layoutColumns).
function Columns({ column, radius }: { column: NonNullable<TokenProps["column"]>; radius: number }) {
  const healthWidth = Math.max(4, radius * TOKEN_LAYOUT.columnWidth);
  const powerWidth = Math.max(2, radius * TOKEN_LAYOUT.powerColumnWidth);
  const gap = Math.max(1, radius * TOKEN_LAYOUT.columnGap);
  const pair = column.power ? healthWidth + gap + powerWidth : healthWidth;
  const bar = (left: number, width: number, full: number, value: number, color: string) => (
    <>
      <div style={{ position: "absolute", left, bottom: 0, width, height: full, background: `rgba(255,255,255,${TOKEN_LAYOUT.columnTrackOpacity})` }} />
      <div style={{ position: "absolute", left, bottom: 0, width, height: full * value, background: color, opacity: 0.92, boxShadow: `0 0 10px ${color}` }} />
    </>
  );
  return (
    <>
      {bar(-pair / 2, healthWidth, radius * TOKEN_LAYOUT.columnHeight, column.value, column.color)}
      {column.power && bar(-pair / 2 + healthWidth + gap, powerWidth, radius * TOKEN_LAYOUT.powerColumnHeight, column.power.value, column.power.color)}
    </>
  );
}

/** A boss sigil (with its turning ticks), and, without a model, the hexagon pin over it. */
export function BossToken({ seconds, facing = 0, dead = false, model = true, halo = null, cast = null, scale = 18, tilt = 58 }: {
  seconds: number;
  facing?: number;
  dead?: boolean;
  model?: boolean;
  halo?: HaloKind | null;
  cast?: { fraction: number; color: string } | null;
  scale?: number;
  tilt?: number;
}) {
  const radius = TOKEN_LAYOUT.bossRadius * scale;
  const plane = TOKEN_LAYOUT.plane;
  const spin = (seconds * TOKEN_LAYOUT.sigilSpin * 180) / Math.PI;
  const castColor = useCssColor(cast?.color ?? "#fff");
  const grey: CSSProperties = dead ? { filter: "grayscale(1) brightness(0.55)" } : {};
  return (
    <div className="relative h-0 w-0">
      <div style={{ position: "absolute", left: 0, top: 0, transform: `perspective(600px) rotateX(${tilt}deg)`, ...grey }}>
        <ArtCanvas draw={drawSigil} style={layer(radius, plane.sigil)} />
        <ArtCanvas draw={drawSigilTicks} style={layer(radius, plane.sigil * plane.ticks, { transform: `rotate(${spin}deg)` })} />
        <ArtCanvas draw={drawBossMarks} style={layer(radius, MARKS_SCALE, { transform: `rotate(${facing}deg)` })} />
        {cast && <ArtCanvas key={`arc|${cast.fraction.toFixed(2)}|${castColor}`} draw={(context) => drawCastArc(context, cast.fraction, castColor)} style={layer(radius, plane.arc)} />}
        {halo && <ArtCanvas key={halo} draw={(context) => drawHalo(context, halo, hexCss(HALO_COLORS[halo]))} style={layer(radius, plane.halo)} />}
      </div>
      {!model && (
        <>
          <div style={{ position: "absolute", left: -1, bottom: 0, width: 2, height: radius * TOKEN_LAYOUT.bossPinHeight * 0.55, background: `linear-gradient(to top, transparent, ${ENEMY_RED})`, ...grey }} />
          <ArtCanvas
            draw={drawBossPin}
            style={{
              position: "absolute",
              left: (-radius * TOKEN_LAYOUT.bossPinSize) / 2,
              bottom: radius * TOKEN_LAYOUT.bossPinHeight * 0.55,
              width: radius * TOKEN_LAYOUT.bossPinSize,
              height: radius * TOKEN_LAYOUT.bossPinSize,
              filter: `drop-shadow(0 4px 6px rgba(0,0,0,.7))${dead ? " grayscale(1) brightness(0.55)" : ""}`,
            }}
          />
        </>
      )}
      {model && (
        <div
          style={{
            position: "absolute",
            left: -radius * 0.45,
            bottom: -radius * 0.25,
            width: radius * 0.9,
            height: radius * 1.6,
            borderRadius: "40% 40% 20% 20%",
            background: dead ? "#57534e" : "linear-gradient(#7f1d1d, #3f0d0d)",
            boxShadow: "0 6px 12px rgba(0,0,0,.6)",
          }}
          title="The boss's model"
        />
      )}
    </div>
  );
}

function drawBossMarks(context: CanvasRenderingContext2D) {
  drawFacingMarks(context, ENEMY_RED, true);
}

/** A patch of ground for token demos. */
export function Ground({ children, height = 150, className = "" }: { children: ReactNode; height?: number; className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-white/10 ${className}`}
      style={{ height, background: "radial-gradient(ellipse at 50% 60%, #2d2a24 0%, #1a1917 70%)" }}
    >
      {children}
    </div>
  );
}

/** Places a child at a point on the ground (percent of the card). */
export function At({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return <div style={{ position: "absolute", left: `${x}%`, top: `${y}%` }}>{children}</div>;
}
