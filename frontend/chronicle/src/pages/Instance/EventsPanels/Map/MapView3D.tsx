import { useEffect, useMemo, useRef, useState } from "react";
import { Scan } from "lucide-react";
import { useSpell } from "@/api/queries";
import { useDatasetId } from "@/hooks/useDatasetId";
import { SpellTooltip } from "@/pages/WoWDB/SpellTooltip";
import { useSmoothReplayTime } from "../RotationTimeline/useSmoothReplayTime";
import { useSpellMeta } from "../RotationTimeline/useSpellMeta";
import type { MapPositionSample } from "./map.processor";
import { interpolatedPositionAt, type MapPoint } from "./mapModel";
import { MAX_EFFECT_PRIMITIVES, MapScene3D, type MapScene3DEffectHover, type MapScene3DUnit } from "./MapScene3D";
import { CAST_ICON_SKIP_SPELLS, DEFAULT_EFFECT_OPTIONS, type EncounterEffects } from "./replayEffects";
import type { MapViewRequest } from "./MapView2D";
import type { MapSceneGround, MapSceneMarker } from "./useMapScene";

export interface MapView3DProps {
  ground: MapSceneGround;
  markers: MapSceneMarker[];
  projectSample: (sample: MapPositionSample) => MapPoint | null;
  cursorMs: number;
  playing: boolean;
  playbackSpeed: number;
  view: MapViewRequest;
  /** Combat events for hit wobble, beams, rings and deaths. */
  effects?: EncounterEffects;
  bossGuids?: ReadonlySet<string>;
  /** Tanks: their heals are kept when effects are capped and float numbers. */
  tankGuids?: ReadonlySet<string>;
  /** Called when WebGL cannot be created or the context is lost. */
  onUnavailable: () => void;
}

const SMOOTH_STORAGE_KEY = "chronicle.map.smooth3d";
const EFFECTS_STORAGE_KEY = "chronicle.map.effects3d";

interface EffectSettings {
  enabled: boolean;
  heals: boolean;
  overheal: boolean;
  periodic: boolean;
  onlySelected: boolean;
  maxEffects: number;
  bars: boolean;
  casts: boolean;
}

const DEFAULT_EFFECT_SETTINGS: EffectSettings = {
  enabled: true,
  heals: DEFAULT_EFFECT_OPTIONS.showHeals,
  overheal: DEFAULT_EFFECT_OPTIONS.showOverheal,
  periodic: DEFAULT_EFFECT_OPTIONS.showPeriodic,
  onlySelected: false,
  maxEffects: MAX_EFFECT_PRIMITIVES,
  bars: true,
  casts: true,
};

const DENSITY_OPTIONS = [16, 32, MAX_EFFECT_PRIMITIVES];

function readStoredEffectSettings(): EffectSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(EFFECTS_STORAGE_KEY) ?? "{}") as Partial<EffectSettings>;
    const settings = { ...DEFAULT_EFFECT_SETTINGS, ...stored };
    if (!DENSITY_OPTIONS.includes(settings.maxEffects)) settings.maxEffects = MAX_EFFECT_PRIMITIVES;
    return settings;
  } catch {
    return DEFAULT_EFFECT_SETTINGS;
  }
}

const toggleClass = (on: boolean) => `rounded border border-white/15 px-1.5 py-0.5 font-medium ${on ? "bg-primary/30 text-foreground" : "bg-black/70 text-muted-foreground hover:text-foreground"}`;

function readStoredSmooth(): boolean {
  try {
    return localStorage.getItem(SMOOTH_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

// three.js needs concrete colors; class colors are CSS custom properties.
function resolveCssColor(color: string, element: Element, cache: Map<string, string>): string {
  const variable = /^var\((--[^)]+)\)$/.exec(color)?.[1];
  if (!variable) return color;
  let resolved = cache.get(variable);
  if (resolved === undefined) {
    resolved = getComputedStyle(element).getPropertyValue(variable).trim() || "#ffffff";
    cache.set(variable, resolved);
  }
  return resolved;
}

// The hovered effect's spell; its data is fetched only once hovered.
function EffectTooltip({ hover }: { hover: MapScene3DEffectHover }) {
  const datasetId = useDatasetId();
  const { data: spell } = useSpell(String(hover.spellId ?? ""), datasetId, { enabled: hover.spellId != null });
  const amount = hover.amount > 0
    ? <div className="text-xs text-muted-foreground">{hover.eventKind === "heal" ? "Healed" : "Hit for"} {hover.amount.toLocaleString()}</div>
    : null;
  return (
    <div className="pointer-events-none absolute z-20 max-w-xs" style={{ left: hover.x + 12, top: hover.y + 12 }}>
      {spell ? <SpellTooltip spell={spell} footer={amount} /> : (
        <div className="rounded border border-white/15 bg-popover px-2 py-1 text-xs text-popover-foreground shadow-lg">
          <div className="font-medium">{hover.spellName || `Spell ${hover.spellId}`}</div>
          {amount}
        </div>
      )}
    </div>
  );
}

export default function MapView3D({
  ground,
  markers,
  projectSample,
  cursorMs,
  playing,
  playbackSpeed,
  view,
  effects,
  bossGuids,
  tankGuids,
  onUnavailable,
}: MapView3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MapScene3D | null>(null);
  const onUnavailableRef = useRef(onUnavailable);
  const colorCacheRef = useRef(new Map<string, string>());
  const [smooth, setSmooth] = useState(readStoredSmooth);
  const smoothMs = useSmoothReplayTime(cursorMs, playing && smooth, playbackSpeed);
  const [effectSettings, setEffectSettings] = useState(readStoredEffectSettings);
  const showBars = effectSettings.bars;
  const [effectHover, setEffectHover] = useState<MapScene3DEffectHover | null>(null);

  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let scene: MapScene3D;
    try {
      scene = new MapScene3D(container, () => onUnavailableRef.current(), setEffectHover);
    } catch {
      onUnavailableRef.current();
      return;
    }
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setGround(ground);
  }, [ground]);

  useEffect(() => {
    sceneRef.current?.setViewport(view.viewport);
  }, [view]);

  useEffect(() => {
    const container = containerRef.current;
    const scene = sceneRef.current;
    if (!container || !scene) return;
    const units = markers.flatMap((marker): MapScene3DUnit[] => {
      const sample = smooth && smoothMs !== null
        ? interpolatedPositionAt(marker.positions, smoothMs) ?? marker.sample
        : marker.sample;
      const point = sample === marker.sample ? marker.point : projectSample(sample) ?? marker.point;
      return [{
        guid: marker.guid,
        point,
        facing: sample.facing,
        color: resolveCssColor(marker.color, container, colorCacheRef.current),
        kind: marker.kind,
        muted: marker.muted,
        name: marker.name,
        health: showBars ? marker.health : null,
        entry: marker.entry,
      }];
    });
    scene.setUnits(units);
  }, [markers, projectSample, showBars, smooth, smoothMs]);

  // Selected players (the unmuted ones while a selection mutes the rest),
  // bosses and tanks; keyed by string so replay ticks don't rebuild the options.
  const selectedKey = markers.some((marker) => marker.muted)
    ? markers.filter((marker) => marker.kind === "player" && !marker.muted).map((marker) => marker.guid).join(",")
    : "";
  const bossKey = bossGuids ? [...bossGuids].join(",") : "";
  const tankKey = tankGuids ? [...tankGuids].join(",") : "";
  const effectOptions = useMemo(() => {
    const selected = selectedKey ? new Set(selectedKey.split(",")) : null;
    const tanks = tankKey ? tankKey.split(",") : [];
    const selectedAndBosses = new Set([...(selected ?? []), ...(bossKey ? bossKey.split(",") : [])]);
    const priority = new Set([...selectedAndBosses, ...tanks]);
    const healText = new Set([...(selected ?? []), ...tanks]);
    return {
      selected,
      castIconGuids: selectedAndBosses.size > 0 ? selectedAndBosses : null,
      healText: healText.size > 0 ? healText : null,
      ...DEFAULT_EFFECT_OPTIONS,
      filterGuids: effectSettings.onlySelected ? selected : null,
      priorityGuids: priority.size > 0 ? priority : null,
      maxEffects: effectSettings.maxEffects,
      showPeriodic: effectSettings.periodic,
      showHeals: effectSettings.heals,
      showOverheal: effectSettings.overheal,
    };
  }, [bossKey, effectSettings, selectedKey, tankKey]);

  // Spell icons float over selected players and bosses while they cast.
  const castGuids = effectSettings.enabled && effectSettings.casts ? effectOptions.castIconGuids : null;
  const castSpellIds = useMemo(() => {
    if (!effects || !castGuids) return [];
    const ids = new Set<number>();
    for (const event of effects.events) {
      if ((event.kind !== "cast_start" && event.kind !== "cast_go") || event.spellId == null) continue;
      if (!CAST_ICON_SKIP_SPELLS.has(event.spellId) && castGuids.has(event.source)) ids.add(event.spellId);
    }
    return [...ids];
  }, [castGuids, effects]);
  const { meta: spellMeta } = useSpellMeta(castSpellIds);

  useEffect(() => {
    const container = containerRef.current;
    const scene = sceneRef.current;
    if (!container || !scene) return;
    scene.setEffects(effectSettings.enabled && effects ? {
      fx: effects,
      options: effectOptions,
      resolveColor: (color) => resolveCssColor(color, container, colorCacheRef.current),
      // Spell names float over the selected players' targets.
      combatTextGuids: effectOptions.selected,
      castIcons: castGuids ? {
        guids: castGuids,
        iconUrl: (spellId) => spellMeta(spellId).icon,
        placeholderUrl: spellMeta(null).icon,
      } : null,
      // Heal amounts float for heals cast by or landing on selected players and tanks.
      healTextGuids: effectOptions.healText,
    } : null);
  }, [castGuids, effectOptions, effectSettings.enabled, effects, spellMeta]);

  useEffect(() => {
    sceneRef.current?.setEffectClock(cursorMs, playing, playbackSpeed);
  }, [cursorMs, playbackSpeed, playing]);

  const updateEffectSettings = (patch: Partial<EffectSettings>) => {
    const next = { ...effectSettings, ...patch };
    setEffectSettings(next);
    try {
      localStorage.setItem(EFFECTS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage may be unavailable; the settings still apply for this session.
    }
  };

  const toggleSmooth = () => {
    const next = !smooth;
    setSmooth(next);
    try {
      localStorage.setItem(SMOOTH_STORAGE_KEY, String(next));
    } catch {
      // Storage may be unavailable; the toggle still applies for this session.
    }
  };

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      {effectHover && <EffectTooltip hover={effectHover} />}
      <div className="absolute right-2 top-2 flex flex-wrap justify-end gap-1 text-[10px]">
        {effects && effectSettings.enabled && (
          <>
            <button type="button" aria-pressed={effectSettings.heals} onClick={() => updateEffectSettings({ heals: !effectSettings.heals })} title="Show heal beams, pulses and numbers" className={toggleClass(effectSettings.heals)}>
              Heals
            </button>
            <button type="button" aria-pressed={effectSettings.overheal} onClick={() => updateEffectSettings({ overheal: !effectSettings.overheal })} title="Also show heals that restored no health (grey)" className={toggleClass(effectSettings.overheal)}>
              Overheal
            </button>
            <button type="button" aria-pressed={effectSettings.periodic} onClick={() => updateEffectSettings({ periodic: !effectSettings.periodic })} title="Show damage and heal-over-time ticks" className={toggleClass(effectSettings.periodic)}>
              DoT ticks
            </button>
            <button type="button" aria-pressed={effectSettings.onlySelected} onClick={() => updateEffectSettings({ onlySelected: !effectSettings.onlySelected })} title="Only show effects involving the selected players" className={toggleClass(effectSettings.onlySelected)}>
              Only selected
            </button>
            <button type="button" aria-pressed={effectSettings.casts} onClick={() => updateEffectSettings({ casts: !effectSettings.casts })} title="Spell icons above selected players and bosses while they cast" className={toggleClass(effectSettings.casts)}>
              Casts
            </button>
            <select
              aria-label="Effect density"
              title="Maximum effects drawn at once"
              value={effectSettings.maxEffects}
              onChange={(event) => updateEffectSettings({ maxEffects: Number(event.target.value) })}
              className="rounded border border-white/15 bg-black/70 px-1 py-0.5 text-muted-foreground [color-scheme:dark]"
            >
              {DENSITY_OPTIONS.map((option) => <option key={option} value={option}>{option} fx</option>)}
            </select>
          </>
        )}
        <button type="button" aria-pressed={showBars} onClick={() => updateEffectSettings({ bars: !showBars })} title="Health bars for bosses, selected players and recently damaged units" className={toggleClass(showBars)}>
          Bars
        </button>
        {effects && (
          <button type="button" aria-pressed={effectSettings.enabled} onClick={() => updateEffectSettings({ enabled: !effectSettings.enabled })} title="Hit wobble, spell beams, cast rings and deaths" className={toggleClass(effectSettings.enabled)}>
            Effects
          </button>
        )}
        <button
          type="button"
          aria-pressed={smooth}
          onClick={toggleSmooth}
          title="Interpolate positions between samples during playback"
          className={`rounded border border-white/15 px-1.5 py-0.5 font-medium ${smooth ? "bg-primary/30 text-foreground" : "bg-black/70 text-muted-foreground hover:text-foreground"}`}
        >
          Smooth
        </button>
        <button
          type="button"
          onClick={() => sceneRef.current?.resetCamera(true)}
          title="Top-down view"
          className="flex items-center gap-1 rounded border border-white/15 bg-black/70 px-1.5 py-0.5 font-medium text-muted-foreground hover:text-foreground"
        >
          <Scan className="h-3 w-3" />
          Top-down
        </button>
      </div>
    </div>
  );
}
