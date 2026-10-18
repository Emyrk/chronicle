import { useCallback, useState } from "react";
import type { AboveDiscMode } from "./MapScene3D";
import { DEFAULT_EFFECT_OPTIONS, MAX_EFFECT_PRIMITIVES, type CastIconMode } from "./replayEffects";

/** The 3D map's display settings, set from the map's settings overlay and kept in local storage. */
export interface EffectSettings {
  enabled: boolean;
  heals: boolean;
  overheal: boolean;
  periodic: boolean;
  onlySelected: boolean;
  maxEffects: number;
  bars: boolean;
  /** Legacy boolean from before castMode; false migrates to "off". */
  casts?: boolean;
  castMode: CastIconMode;
  /** The live value drawn as a column above each player's token. */
  aboveDisc: AboveDiscMode;
  /** Seconds of movement trail behind each unit; 0 for none. */
  trailSeconds: number;
}

export const EFFECTS_STORAGE_KEY = "chronicle.map.effects3d";

export const DEFAULT_EFFECT_SETTINGS: EffectSettings = {
  enabled: true,
  heals: DEFAULT_EFFECT_OPTIONS.showHeals,
  overheal: DEFAULT_EFFECT_OPTIONS.showOverheal,
  periodic: DEFAULT_EFFECT_OPTIONS.showPeriodic,
  onlySelected: false,
  maxEffects: MAX_EFFECT_PRIMITIVES,
  bars: true,
  castMode: "selected",
  aboveDisc: "none",
  trailSeconds: 0,
};

export const ABOVE_DISC_MODES: { value: AboveDiscMode; label: string; title: string }[] = [
  { value: "none", label: "None", title: "Nothing above the tokens" },
  { value: "health", label: "Health", title: "A column as tall as each player's health, green to red, with its power (mana, rage, energy) in a thinner one beside it" },
];

export const CAST_MODES: { value: CastIconMode; label: string; title: string }[] = [
  { value: "off", label: "Off", title: "No cast icons" },
  { value: "selected", label: "Selected", title: "Cast icons over selected players and bosses; with nothing selected, over everyone in groups of 10 or fewer" },
  { value: "all", label: "All", title: "Cast icons over every player and boss" },
];

export const TRAIL_OPTIONS: { value: number; label: string; title: string }[] = [
  { value: 0, label: "Off", title: "No movement trails" },
  ...[1, 2, 3, 4].map((seconds) => ({ value: seconds, label: `${seconds}s`, title: `A fading line along where each unit was over the last ${seconds} s` })),
];

export const DENSITY_OPTIONS = [16, 32, MAX_EFFECT_PRIMITIVES];

export function readStoredEffectSettings(): EffectSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(EFFECTS_STORAGE_KEY) ?? "{}") as Partial<EffectSettings>;
    const settings = { ...DEFAULT_EFFECT_SETTINGS, ...stored };
    if (!stored.castMode && stored.casts === false) settings.castMode = "off";
    if (!CAST_MODES.some((mode) => mode.value === settings.castMode)) settings.castMode = "selected";
    if (!DENSITY_OPTIONS.includes(settings.maxEffects)) settings.maxEffects = MAX_EFFECT_PRIMITIVES;
    if (!ABOVE_DISC_MODES.some((mode) => mode.value === settings.aboveDisc)) settings.aboveDisc = DEFAULT_EFFECT_SETTINGS.aboveDisc;
    if (!TRAIL_OPTIONS.some((option) => option.value === settings.trailSeconds)) settings.trailSeconds = DEFAULT_EFFECT_SETTINGS.trailSeconds;
    return settings;
  } catch {
    return DEFAULT_EFFECT_SETTINGS;
  }
}

/** The effect settings and a patch function that saves them. */
export function useEffectSettings(): [EffectSettings, (patch: Partial<EffectSettings>) => void] {
  const [settings, setSettings] = useState(readStoredEffectSettings);
  const update = useCallback((patch: Partial<EffectSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(EFFECTS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage may be unavailable; the settings still apply for this session.
      }
      return next;
    });
  }, []);
  return [settings, update];
}
