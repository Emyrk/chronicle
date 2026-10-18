import { useEffect, useState, type ReactNode } from "react";
import { Eye, Footprints, Gamepad2, Globe, Scan, Sparkles, X, type LucideIcon } from "lucide-react";
import { Switch } from "@/components/ui/Switch/Switch";
import { cn } from "@/lib/utils";
import { MAP_CONTROL_KEYBINDS } from "./mapControls";
import { ABOVE_DISC_MODES, CAST_MODES, DENSITY_OPTIONS, type EffectSettings } from "./mapViewSettings";

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
  enemyFrames: boolean;
  onEnemyFrames: (shown: boolean) => void;
  /** The "3D map" dungeon mesh, when the instance has one. */
  mesh: { on: boolean; locked: boolean; loading: boolean; onToggle: () => void } | null;
  floors: { list: number[]; value: number | null; onChange: (floor: number) => void } | null;
  onTopDown: () => void;
  /** Walk mode, when the dungeon mesh is up to walk on. */
  walk: { on: boolean; onToggle: () => void } | null;
  adStrafe: boolean;
  onAdStrafe: (on: boolean) => void;
}

/** One tab of the settings. A tab with no content (null) is hidden. */
interface SettingsTab {
  id: string;
  label: string;
  icon: LucideIcon;
  content: ReactNode | null;
}

const TAB_STORAGE_KEY = "chronicle.map.settingsTab";

/**
 * Everything the map lets you set, in a tabbed dialog over the map, like a
 * game's options screen. Add a surface by adding a tab to `tabs`. Each setting
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
  enemyFrames,
  onEnemyFrames,
  mesh,
  floors,
  onTopDown,
  walk,
  adStrafe,
  onAdStrafe,
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
  const tabs: SettingsTab[] = [
    {
      id: "display",
      label: "Display",
      icon: Eye,
      content: (
        <>
          <Section title="Overlays">
            <Toggle label="Raid frames" detail="Every player's health, power and casts" checked={raidFrames} onChange={onRaidFrames} />
            <Toggle label="Enemy frames" detail="Every enemy in the encounter, bosses first" checked={enemyFrames} onChange={onEnemyFrames} />
          </Section>
          {show3D && (
            <Section title="Units">
              <Toggle
                label="Health bars"
                detail="Over bosses, selected players and recently damaged units"
                checked={effectSettings.bars}
                onChange={(bars) => onEffectSettings({ bars })}
              />
              <Choice
                label="Above the token"
                value={effectSettings.aboveDisc}
                options={ABOVE_DISC_MODES}
                onChange={(aboveDisc) => onEffectSettings({ aboveDisc })}
              />
            </Section>
          )}
        </>
      ),
    },
    {
      id: "effects",
      label: "Effects",
      icon: Sparkles,
      content: show3D && hasEffects ? (
        <>
          <Section title="Combat effects">
            <Toggle
              label="Combat effects"
              detail="Hit wobble, spell beams, area rings and heal pulses"
              checked={effectsOn}
              onChange={(enabled) => onEffectSettings({ enabled })}
            />
            <Toggle label="Heals" detail="Heal beams, pulses and numbers" checked={effectSettings.heals} disabled={!effectsOn} onChange={(heals) => onEffectSettings({ heals })} />
            <Toggle label="Overheal" detail="Heals that restored no health, in grey" checked={effectSettings.overheal} disabled={!effectsOn} onChange={(overheal) => onEffectSettings({ overheal })} />
            <Toggle label="DoT ticks" detail="Damage and heal over time ticks" checked={effectSettings.periodic} disabled={!effectsOn} onChange={(periodic) => onEffectSettings({ periodic })} />
            <Toggle label="Only selected" detail="Only effects involving the selected players" checked={effectSettings.onlySelected} disabled={!effectsOn} onChange={(onlySelected) => onEffectSettings({ onlySelected })} />
          </Section>
          <Section title="Detail">
            <Choice
              label="Cast icons"
              disabled={!effectsOn}
              value={effectSettings.castMode}
              options={CAST_MODES}
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
        </>
      ) : null,
    },
    {
      id: "world",
      label: "World",
      icon: Globe,
      content: mesh || floors ? (
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
      ) : null,
    },
    {
      id: "controls",
      label: "Controls",
      icon: Gamepad2,
      content: show3D ? (
        <>
          <Section title="Camera">
            <Toggle
              label="A/D strafe"
              detail="A and D strafe and Q and E turn, instead of the other way round"
              checked={adStrafe}
              onChange={onAdStrafe}
            />
            <div className="flex flex-wrap gap-2">
              <ActionButton icon={Scan} onClick={() => { onTopDown(); onClose(); }}>Top-down view</ActionButton>
              {walk && (
                <ActionButton icon={Footprints} title="WASD to move, Space to jump (hold to fly), G or Esc to leave" onClick={() => { walk.onToggle(); onClose(); }}>
                  {walk.on ? "Leave walk mode" : "Walk mode (G)"}
                </ActionButton>
              )}
            </div>
          </Section>
          <Section title="Keybinds">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
              {MAP_CONTROL_KEYBINDS.map((bind) => (
                <div key={bind.keys} className="contents">
                  <dt><kbd className="whitespace-nowrap rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-200">{bind.keys}</kbd></dt>
                  <dd className="text-zinc-400">{bind.action}</dd>
                </div>
              ))}
            </dl>
          </Section>
        </>
      ) : null,
    },
  ];

  const visibleTabs = tabs.filter((tab) => tab.content !== null);
  const [tabId, setTabId] = useState(readStoredTab);
  const activeTab = visibleTabs.find((tab) => tab.id === tabId) ?? visibleTabs[0];
  const selectTab = (id: string) => {
    setTabId(id);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, id);
    } catch {
      // Storage may be unavailable; the tab still switches.
    }
  };

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black/60 p-3 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Map settings"
        className="flex max-h-full w-[34rem] max-w-full flex-col overflow-hidden rounded-md border border-white/10 bg-zinc-950/95 text-sm text-zinc-100 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-3 pt-2">
          <div role="tablist" aria-label="Settings" className="-mb-px flex min-w-0 overflow-x-auto">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const active = tab.id === activeTab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => selectTab(tab.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide",
                    active ? "border-primary text-zinc-50" : "border-transparent text-zinc-500 hover:text-zinc-200",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={onClose} aria-label="Close settings" title="Close (Esc)" className="mb-1 ml-2 shrink-0 rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div role="tabpanel" aria-label={activeTab.label} className="styled-scrollbar flex min-h-[16rem] flex-col gap-5 overflow-y-auto p-4">
          {activeTab.content}
        </div>

        <p className="border-t border-white/10 px-4 py-2 text-[10px] text-zinc-500">Settings are saved in this browser.</p>
      </div>
    </div>
  );
}

function readStoredTab(): string {
  try {
    return localStorage.getItem(TAB_STORAGE_KEY) ?? "display";
  } catch {
    return "display";
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h4 className="border-b border-white/5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{title}</h4>
      {children}
    </section>
  );
}

function ActionButton({ icon: Icon, title, onClick, children }: { icon: LucideIcon; title?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={title} className="flex items-center gap-2 rounded border border-white/15 px-2 py-1.5 text-xs hover:bg-white/10">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
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
