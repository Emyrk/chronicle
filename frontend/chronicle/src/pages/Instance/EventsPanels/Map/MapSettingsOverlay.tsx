import { useEffect, useState, type ReactNode } from "react";
import { Gamepad2, Globe, PersonStanding, RotateCcw, Scan, Sparkles, UserRound, X, type LucideIcon } from "lucide-react";
import { Switch } from "@/components/ui/Switch/Switch";
import { cn } from "@/lib/utils";
import { MAP_CONTROL_KEYBINDS } from "./mapControls";
import { ABOVE_DISC_MODES, CAST_MODES, DEFAULT_EFFECT_SETTINGS, DENSITY_OPTIONS, TRAIL_OPTIONS, type EffectSettings } from "./mapViewSettings";
import { DEFAULT_WALK_AVATAR, WALK_AVATAR_GROUPS, WALK_AVATARS } from "./walkAvatars";

export interface MapSettingsOverlayProps {
  onClose: () => void;
  effectSettings: EffectSettings;
  onEffectSettings: (patch: Partial<EffectSettings>) => void;
  /** Effects and health bars are drawn only by the 3D view. */
  show3D: boolean;
  /** The encounter has combat events to draw. */
  hasEffects: boolean;
  /** The "3D map" dungeon mesh, when the instance has one. */
  mesh: { on: boolean; locked: boolean; loading: boolean; onToggle: () => void } | null;
  floors: { list: number[]; value: number | null; onChange: (floor: number) => void } | null;
  onTopDown: () => void;
  adStrafe: boolean;
  onAdStrafe: (on: boolean) => void;
  /** The character you walk as (walkAvatars ids). */
  walkAvatar: string;
  onWalkAvatar: (id: string) => void;
  /** Every map setting back to its default, hidden raid and enemy frames shown again. */
  onResetAll: () => void;
}

/** One tab of the settings. A tab with no content (null) is hidden. */
interface SettingsTab {
  id: string;
  label: string;
  icon: LucideIcon;
  content: ReactNode | null;
  /** Puts this tab's settings back to their defaults; `changed` when any differs. */
  reset?: { changed: boolean; apply: () => void };
}

const TAB_STORAGE_KEY = "chronicle.map.settingsTab";

// The effect settings each tab owns, for its reset and its changed marks.
const UNIT_KEYS = ["bars", "aboveDisc", "trailSeconds"] as const satisfies readonly (keyof EffectSettings)[];
const COMBAT_KEYS = ["enabled", "heals", "overheal", "periodic", "castMode", "onlySelected", "maxEffects"] as const satisfies readonly (keyof EffectSettings)[];

function defaultsFor(keys: readonly (keyof EffectSettings)[]): Partial<EffectSettings> {
  return Object.fromEntries(keys.map((key) => [key, DEFAULT_EFFECT_SETTINGS[key]]));
}

// How long "Reset all" waits for its confirming second click.
const CONFIRM_MS = 4000;

/**
 * Everything the map lets you set, in a tabbed dialog over the map, like a
 * game's options screen: what is drawn on the units, the combat effects, the
 * world, the controls and your walk-mode character. Things the map toggles
 * itself (raid and enemy frames, walk mode, planning) stay on the map. Each
 * tab can reset to its defaults, and the footer resets everything. Add a
 * surface by adding a tab to `tabs`; each setting is kept in local storage by
 * its owner (effects, the mesh, controls, the avatar).
 */
export function MapSettingsOverlay({
  onClose,
  effectSettings,
  onEffectSettings,
  show3D,
  hasEffects,
  mesh,
  floors,
  onTopDown,
  adStrafe,
  onAdStrafe,
  walkAvatar,
  onWalkAvatar,
  onResetAll,
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

  const changed = (key: keyof EffectSettings) => effectSettings[key] !== DEFAULT_EFFECT_SETTINGS[key];
  const effectsOn = effectSettings.enabled;
  const tabs: SettingsTab[] = [
    {
      id: "units",
      label: "Units",
      icon: UserRound,
      content: show3D ? (
        <Section title="On each unit">
          <Toggle
            label="Health bars"
            detail="Over bosses, selected players and recently damaged units"
            checked={effectSettings.bars}
            changed={changed("bars")}
            onChange={(bars) => onEffectSettings({ bars })}
          />
          <Choice
            label="Above the token"
            detail="A live value as a column over each player"
            value={effectSettings.aboveDisc}
            options={ABOVE_DISC_MODES}
            changed={changed("aboveDisc")}
            onChange={(aboveDisc) => onEffectSettings({ aboveDisc })}
          />
          <Choice
            label="Movement trail"
            detail="A fading line along where each unit was"
            value={effectSettings.trailSeconds}
            options={TRAIL_OPTIONS}
            changed={changed("trailSeconds")}
            onChange={(trailSeconds) => onEffectSettings({ trailSeconds })}
          />
        </Section>
      ) : null,
      reset: { changed: UNIT_KEYS.some(changed), apply: () => onEffectSettings(defaultsFor(UNIT_KEYS)) },
    },
    {
      id: "combat",
      label: "Combat",
      icon: Sparkles,
      content: show3D && hasEffects ? (
        <>
          <Toggle
            label="Combat effects"
            detail="Replay what happened: hits, spell beams, area rings, heals and cast icons"
            checked={effectsOn}
            changed={changed("enabled")}
            onChange={(enabled) => onEffectSettings({ enabled })}
          />
          <Section title="Show">
            <Toggle label="Heals" detail="Heal beams, pulses and numbers" checked={effectSettings.heals} changed={changed("heals")} disabled={!effectsOn} onChange={(heals) => onEffectSettings({ heals })} />
            <Toggle label="Overheal" detail="Heals that restored no health, in grey" checked={effectSettings.overheal} changed={changed("overheal")} disabled={!effectsOn} onChange={(overheal) => onEffectSettings({ overheal })} />
            <Toggle label="DoT ticks" detail="Damage and heal over time ticks" checked={effectSettings.periodic} changed={changed("periodic")} disabled={!effectsOn} onChange={(periodic) => onEffectSettings({ periodic })} />
            <Choice
              label="Cast icons"
              detail="The spell's icon over a caster"
              disabled={!effectsOn}
              value={effectSettings.castMode}
              options={CAST_MODES}
              changed={changed("castMode")}
              onChange={(castMode) => onEffectSettings({ castMode })}
            />
          </Section>
          <Section title="Limit">
            <Toggle label="Only selected" detail="Only effects involving the selected players" checked={effectSettings.onlySelected} changed={changed("onlySelected")} disabled={!effectsOn} onChange={(onlySelected) => onEffectSettings({ onlySelected })} />
            <Choice
              label="Effects at once"
              detail="Fewer keeps big raids readable"
              disabled={!effectsOn}
              value={effectSettings.maxEffects}
              options={DENSITY_OPTIONS.map((option) => ({ value: option, label: String(option), title: `Draw at most ${option} effects at once` }))}
              changed={changed("maxEffects")}
              onChange={(maxEffects) => onEffectSettings({ maxEffects })}
            />
          </Section>
        </>
      ) : null,
      reset: { changed: COMBAT_KEYS.some(changed), apply: () => onEffectSettings(defaultsFor(COMBAT_KEYS)) },
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
              changed={!mesh.locked && !mesh.on}
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
      reset: mesh && !mesh.locked ? { changed: !mesh.on, apply: () => { if (!mesh.on) mesh.onToggle(); } } : undefined,
    },
    {
      id: "controls",
      label: "Controls",
      icon: Gamepad2,
      content: show3D ? (
        <>
          <Section title="Movement">
            <Toggle
              label="A/D strafe"
              detail="A and D strafe and Q and E turn, instead of the other way round"
              checked={adStrafe}
              changed={!adStrafe}
              onChange={onAdStrafe}
            />
          </Section>
          <Section title="Camera">
            <div>
              <ActionButton icon={Scan} onClick={() => { onTopDown(); onClose(); }}>Top-down view</ActionButton>
            </div>
          </Section>
          <Section title="Keys">
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
      reset: { changed: !adStrafe, apply: () => onAdStrafe(true) },
    },
    {
      id: "character",
      label: "Character",
      icon: PersonStanding,
      content: show3D ? (
        <>
          <p className="text-[11px] text-zinc-400">
            Who you walk as in walk mode (G): a creature from Azeroth, at its own size.
          </p>
          <Section title="Classic">
            <AvatarGrid options={WALK_AVATARS.filter((option) => option.group === null)} value={walkAvatar} onChange={onWalkAvatar} />
          </Section>
          {WALK_AVATAR_GROUPS.map(({ group, title }) => (
            <Section key={group} title={title}>
              <AvatarGrid options={WALK_AVATARS.filter((option) => option.group === group)} value={walkAvatar} onChange={onWalkAvatar} />
            </Section>
          ))}
        </>
      ) : null,
      reset: { changed: walkAvatar !== DEFAULT_WALK_AVATAR, apply: () => onWalkAvatar(DEFAULT_WALK_AVATAR) },
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

  // "Reset all" asks for a second click, which it waits a few seconds for.
  const [confirmingReset, setConfirmingReset] = useState(false);
  useEffect(() => {
    if (!confirmingReset) return;
    const id = setTimeout(() => setConfirmingReset(false), CONFIRM_MS);
    return () => clearTimeout(id);
  }, [confirmingReset]);
  const resetAll = () => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    setConfirmingReset(false);
    onResetAll();
  };

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black/60 p-3 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Map settings"
        className="flex max-h-full w-[38rem] max-w-full flex-col overflow-hidden rounded-md border border-white/10 bg-zinc-950/95 text-sm text-zinc-100 shadow-2xl"
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
                  {tab.reset?.changed && <ChangedDot />}
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
          {activeTab.reset && (
            <div className="mt-auto flex justify-end">
              <ActionButton icon={RotateCcw} disabled={!activeTab.reset.changed} onClick={activeTab.reset.apply}>
                Reset {activeTab.label.toLowerCase()} to defaults
              </ActionButton>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-2">
          <p className="flex items-center gap-1.5 text-[10px] text-zinc-500">
            Settings are saved in this browser. <ChangedDot /> changed from the default.
          </p>
          <button
            type="button"
            onClick={resetAll}
            title="Every map setting back to its default, and hidden raid and enemy frames shown again"
            className={cn(
              "shrink-0 rounded px-2 py-1 text-[11px]",
              confirmingReset ? "bg-red-500/80 text-white hover:bg-red-500" : "text-zinc-400 hover:bg-white/10 hover:text-zinc-100",
            )}
          >
            {confirmingReset ? "Click again to reset everything" : "Reset all map settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

function readStoredTab(): string {
  try {
    return localStorage.getItem(TAB_STORAGE_KEY) ?? "units";
  } catch {
    return "units";
  }
}

// Marks a setting (or a tab holding one) that differs from its default.
function ChangedDot() {
  return <span aria-label="changed from the default" title="Changed from the default" className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h4 className="border-b border-white/5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{title}</h4>
      {children}
    </section>
  );
}

function ActionButton({ icon: Icon, title, disabled = false, onClick, children }: { icon: LucideIcon; title?: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={title} disabled={disabled} className="flex items-center gap-2 rounded border border-white/15 px-2 py-1.5 text-xs enabled:hover:bg-white/10 disabled:opacity-40">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function AvatarGrid({ options, value, onChange }: { options: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
          className={cn(
            "truncate rounded border px-2 py-1.5 text-left text-[11px]",
            option.id === value ? "border-primary bg-primary/25 text-zinc-50" : "border-white/10 text-zinc-300 hover:bg-white/10",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// A setting's name, with its changed mark and one line on what it does.
function SettingLabel({ label, detail, changed }: { label: string; detail?: string; changed: boolean }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex items-center gap-1.5 text-xs font-medium">
        {label}
        {changed && <ChangedDot />}
      </span>
      {detail && <span className="text-[10px] leading-snug text-zinc-400">{detail}</span>}
    </span>
  );
}

function Toggle({
  label,
  detail,
  checked,
  changed = false,
  disabled = false,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  changed?: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={cn("flex items-start justify-between gap-3", disabled ? "opacity-45" : "cursor-pointer")}>
      <SettingLabel label={label} detail={detail} changed={changed} />
      <Switch size="sm" checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

function Choice<T extends string | number>({
  label,
  detail,
  value,
  options,
  changed = false,
  disabled = false,
  onChange,
}: {
  label: string;
  detail?: string;
  value: T;
  options: { value: T; label: string; title: string }[];
  changed?: boolean;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", disabled && "opacity-45")}>
      <SettingLabel label={label} detail={detail} changed={changed} />
      <div role="group" aria-label={label} className="flex shrink-0 gap-0.5 rounded border border-white/15 p-0.5">
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
