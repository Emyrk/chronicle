/* eslint-disable react-refresh/only-export-components -- The legend's art components share their hooks. */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  BOSS_SPIRE,
  bossSpireCastGlow,
  DEAD_RING,
  DEBUFF_PLANE,
  DISPEL_COLORS,
  DROP_LINE,
  ENEMY_RED,
  HALO_COLORS,
  MARKS_SCALE,
  TOKEN_ART_SIZE,
  TOKEN_LAYOUT,
  drawCastArc,
  drawDebuffTint,
  drawDisc,
  drawFacingMarks,
  drawHalo,
  drawShadow,
  drawSigil,
  drawSigilTicks,
  drawUnitPlate,
  UNIT_PLATE,
  unitPlateSize,
  type DispelKind,
  type HaloKind,
  type UnitPlateInfo,
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

/** A hovered unit's nameplate, drawn by the map's own drawUnitPlate; centred on its container's origin, above it. */
export function UnitPlate({ info }: { info: UnitPlateInfo }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const nameColor = useCssColor(info.nameColor);
  const size = unitPlateSize(info);
  // Redrawn when anything it shows changes; the key carries the resolved colour.
  const key = JSON.stringify({ ...info, nameColor });
  useEffect(() => {
    const context = ref.current?.getContext("2d");
    if (context) drawUnitPlate(context, JSON.parse(key) as UnitPlateInfo);
  }, [key]);
  return (
    <canvas
      ref={ref}
      width={size.width * UNIT_PLATE.scale}
      height={size.height * UNIT_PLATE.scale}
      aria-hidden
      style={{ position: "absolute", left: -size.width / 2, top: -size.height, width: size.width, height: size.height }}
    />
  );
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
  /** A guardian's mark: a totem's pole instead of the paw. */
  totem?: boolean;
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
  totem = false,
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
          <ArtCanvas key={`${image?.src}|${shownRing}|${dead}|${totem}`} draw={(context) => drawDisc(context, { image, ring: ringColor, dead, well: kind === "hostile" ? "enemy" : kind === "pet" ? (totem ? "totem" : "guardian") : null })} style={layer(radius, 1)} />
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

/** A boss sigil (with its turning ticks), and, without a model, the crystal standing on it. */
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
  const spireHeight = radius * BOSS_SPIRE.profile[BOSS_SPIRE.profile.length - 1][1];
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
        <ArtCanvas
          draw={(context) => drawBossSpire(context, seconds * BOSS_SPIRE.spin, cast ? { color: castColor, glow: bossSpireCastGlow(cast.fraction, seconds) } : null)}
          style={{
            position: "absolute",
            left: -spireHeight / 2,
            bottom: 0,
            width: spireHeight,
            height: spireHeight,
            filter: `drop-shadow(0 4px 6px rgba(0,0,0,.7))${dead ? " grayscale(1) brightness(0.55)" : ""}`,
          }}
        />
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

// The map's boss crystal (a lathe of BOSS_SPIRE.profile), seen from the side
// and turned by `turn` radians: each face toward the viewer, lit from the left.
// Casting, it is painted over in the spell's colour, as the map turns it.
function drawBossSpire(context: CanvasRenderingContext2D, turn: number, cast: { color: string; glow: number } | null) {
  const profile = BOSS_SPIRE.profile;
  const scale = TOKEN_ART_SIZE / profile[profile.length - 1][1];
  const step = (Math.PI * 2) / BOSS_SPIRE.sides;
  const point = ([width, height]: readonly number[], angle: number) => [TOKEN_ART_SIZE / 2 + Math.sin(angle) * width * scale, TOKEN_ART_SIZE - height * scale];
  for (let side = 0; side < BOSS_SPIRE.sides; side++) {
    const from = turn + side * step;
    const middle = from + step / 2;
    if (Math.cos(middle) <= 0) continue;
    const light = 0.55 + 0.45 * Math.max(0, Math.cos(middle + 0.7));
    for (let ring = 0; ring < profile.length - 1; ring++) {
      const corners = [point(profile[ring], from), point(profile[ring], from + step), point(profile[ring + 1], from + step), point(profile[ring + 1], from)];
      // The underside, facing the floor, is darker.
      const shade = ring === 0 ? light * 0.65 : light;
      context.fillStyle = `rgb(${239 * shade}, ${68 * shade}, ${68 * shade})`;
      context.beginPath();
      corners.forEach(([x, y], index) => (index === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
      context.closePath();
      context.fill();
      if (cast) {
        context.save();
        context.globalAlpha = cast.glow * shade;
        context.fillStyle = cast.color;
        context.fill();
        context.restore();
      }
    }
  }
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
