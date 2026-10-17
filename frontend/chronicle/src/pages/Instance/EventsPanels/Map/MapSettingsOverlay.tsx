import { useEffect, type ReactNode } from "react";
import { Scan, X } from "lucide-react";
import { Switch } from "@/components/ui/Switch/Switch";
import { cn } from "@/lib/utils";
import { CAST_MODES, DENSITY_OPTIONS, type EffectSettings } from "./mapViewSettings";

export interface MapSettingsOverlayProps {
  onClose: () => void;
  effectSettings: EffectSettings;
  onEffectSettings: (patch: Partial<EffectSettings>) => void;
  /** Effects and health bars are drawn only by the 3D view. */
  show3D: boolean;
  /** The encounter has combat events to draw. */
  hasEffects: boolean;
  raidFrames: boolean;
  onRaidFrames: (shown: boolean) => void;
  /** The "3D map" dungeon mesh, when the instance has one. */
  mesh: { on: boolean; locked: boolean; loading: boolean; onToggle: () => void } | null;
  floors: { list: number[]; value: number | null; onChange: (floor: number) => void } | null;
  onTopDown: () => void;
}

/**
 * Everything the map lets you set, in one overlay over the map. Each setting
 * is kept in local storage by its owner (effects, raid frames, the mesh).
 */
export function MapSettingsOverlay({
  onClose,
  effectSettings,
  onEffectSettings,
  show3D,
  hasEffects,
  raidFrames,
  onRaidFrames,
  mesh,
  floors,
  onTopDown,
}: MapSettingsOverlayProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const effectsOn = effectSettings.enabled;
  return (
    <div className="absolute inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-[1px]" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Map settings"
        className="styled-scrollbar flex h-full w-72 max-w-full flex-col gap-4 overflow-y-auto border-l border-white/10 bg-zinc-950/95 p-3 text-sm text-zinc-100 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Map settings</h3>
          <button type="button" onClick={onClose} aria-label="Close settings" title="Close (Esc)" className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <Section title="Overlays">
          <Toggle label="Raid frames" detail="Every player's health, power and casts" checked={raidFrames} onChange={onRaidFrames} />
        </Section>

        {show3D && (
          <Section title="Units">
            <Toggle
              label="Health bars"
              detail="Over bosses, selected players and recently damaged units"
              checked={effectSettings.bars}
              onChange={(bars) => onEffectSettings({ bars })}
            />
          </Section>
        )}

        {show3D && hasEffects && (
          <Section title="Effects">
            <Toggle
              label="Combat effects"
              detail="Hit wobble, spell beams, cast rings and deaths"
              checked={effectsOn}
              onChange={(enabled) => onEffectSettings({ enabled })}
            />
            <Toggle label="Heals" detail="Heal beams, pulses and numbers" checked={effectSettings.heals} disabled={!effectsOn} onChange={(heals) => onEffectSettings({ heals })} />
            <Toggle label="Overheal" detail="Heals that restored no health, in grey" checked={effectSettings.overheal} disabled={!effectsOn} onChange={(overheal) => onEffectSettings({ overheal })} />
            <Toggle label="DoT ticks" detail="Damage and heal over time ticks" checked={effectSettings.periodic} disabled={!effectsOn} onChange={(periodic) => onEffectSettings({ periodic })} />
            <Toggle label="Only selected" detail="Only effects involving the selected players" checked={effectSettings.onlySelected} disabled={!effectsOn} onChange={(onlySelected) => onEffectSettings({ onlySelected })} />
            <Choice
              label="Cast icons"
              disabled={!effectsOn}
              value={effectSettings.castMode}
              options={CAST_MODES.map((mode) => ({ value: mode.value, label: mode.label, title: mode.title }))}
              onChange={(castMode) => onEffectSettings({ castMode })}
            />
            <Choice
              label="Effects at once"
              disabled={!effectsOn}
              value={effectSettings.maxEffects}
              options={DENSITY_OPTIONS.map((option) => ({ value: option, label: String(option), title: `Draw at most ${option} effects at once` }))}
              onChange={(maxEffects) => onEffectSettings({ maxEffects })}
            />
          </Section>
        )}

        {(mesh || floors) && (
          <Section title="Ground">
            {mesh && (
              <Toggle
                label="3D map"
                detail={mesh.locked
                  ? "This instance has no map artwork; the dungeon mesh is all there is"
                  : mesh.loading ? "Loading the dungeon mesh…" : "Stand units on the real dungeon mesh instead of the map tiles"}
                checked={mesh.on}
                disabled={mesh.locked}
                onChange={() => mesh.onToggle()}
              />
            )}
            {floors && (
              <Choice
                label="Floor"
                value={floors.value ?? floors.list[0]}
                options={floors.list.map((floor) => ({ value: floor, label: String(floor), title: `Floor ${floor}` }))}
                onChange={floors.onChange}
              />
            )}
          </Section>
        )}

        {show3D && (
          <Section title="Camera">
            <button
              type="button"
              onClick={() => { onTopDown(); onClose(); }}
              className="flex items-center gap-2 rounded border border-white/15 px-2 py-1.5 text-xs hover:bg-white/10"
            >
              <Scan className="h-3.5 w-3.5" />
              Top-down view
            </button>
          </Section>
        )}

        <p className="mt-auto text-[10px] text-zinc-500">Settings are saved in this browser.</p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{title}</h4>
      {children}
    </section>
  );
}

function Toggle({
  label,
  detail,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={cn("flex items-start justify-between gap-3", disabled ? "opacity-45" : "cursor-pointer")}>
      <span className="flex min-w-0 flex-col">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-[10px] leading-snug text-zinc-400">{detail}</span>
      </span>
      <Switch size="sm" checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

function Choice<T extends string | number>({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; title: string }[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", disabled && "opacity-45")}>
      <span className="text-xs font-medium">{label}</span>
      <div role="group" aria-label={label} className="flex gap-0.5 rounded border border-white/15 p-0.5">
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            disabled={disabled}
            aria-pressed={option.value === value}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-sm px-2 py-0.5 text-[11px]",
              option.value === value ? "bg-primary/30 text-zinc-50" : "text-zinc-400 enabled:hover:text-zinc-100",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
