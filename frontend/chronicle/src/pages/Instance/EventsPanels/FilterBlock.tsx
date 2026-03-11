import { useState, useCallback, useRef, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSpell } from "@/api/queries";
import { SpellIconWithTooltip } from "@/components/ui/SpellIconWithTooltip";
import type { PanelFilter, PanelFilterType } from "./processors/filters";
import { useTimeRangeContextOptional } from "../TimeRangeContext";

const FILTER_TYPES: { value: PanelFilterType; label: string }[] = [
  { value: "ability_name", label: "Ability Name" },
  { value: "ability_id", label: "Ability ID" },
  { value: "ability_school", label: "Ability School" },
  { value: "ability_hittype", label: "Hit Type" },
  { value: "source_type", label: "Source" },
  { value: "target_type", label: "Target" },
  { value: "time_range", label: "Time Range" },
];

import { SPELL_SCHOOLS, SCHOOL_BG_COLORS } from "@/components/SpellSchoolBadge";

const SCHOOL_OPTIONS = SPELL_SCHOOLS.map((s) => ({
  label: s,
  value: s.toLowerCase(),
  color: SCHOOL_BG_COLORS[s],
}));

const HITTYPE_OPTIONS = [
  { label: "Hit", value: "hit" },
  { label: "Crit", value: "crit" },
  { label: "Miss", value: "miss" },
  { label: "Dodge", value: "dodge" },
  { label: "Parry", value: "parry" },
  { label: "Glancing", value: "glancing" },
  { label: "Crushing", value: "crushing" },
  // { label: "Partial Resist", value: "partial_resist" },
  { label: "Full Resist", value: "full_resist" },
  // { label: "Partial Absorb", value: "partial_absorb" },
  { label: "Full Absorb", value: "full_absorb" },
  // { label: "Partial Block", value: "partial_block" },
  { label: "Full Block", value: "full_block" },
  { label: "Evade", value: "evade" },
  { label: "Immune", value: "immune" },
  // { label: "Deflect", value: "deflect" },
  // { label: "Interrupt", value: "interrupt" },
  // { label: "Reflect", value: "reflect" },
  { label: "Periodic", value: "periodic" },
  { label: "Off-hand", value: "offhand" },
  { label: "Split", value: "split" },
] as const;

const SOURCE_TYPE_IDENTITY_OPTIONS = [
  { label: "Selected Players", value: "selected_players" },
  { label: "Selected Enemies", value: "selected_enemies" },
  { label: "Custom", value: "custom" },
] as const;

const SOURCE_TYPE_TYPE_OPTIONS = [
  { label: "Player", value: "player" },
  { label: "Pet", value: "pet" },
  { label: "Enemy Pet", value: "enemy_pet" },
  { label: "Enemy", value: "enemy" },
  { label: "Object", value: "object" },
] as const;

const SOURCE_TYPE_ALL_OPTIONS = [...SOURCE_TYPE_IDENTITY_OPTIONS, ...SOURCE_TYPE_TYPE_OPTIONS];

/** Known toggle option keys — anything else in the value array is a custom entry */
const SOURCE_TYPE_KEYS: Set<string> = new Set(SOURCE_TYPE_ALL_OPTIONS.map((o) => o.value));

const APPLY_TO_OPTIONS = [
  { label: "Damage", value: "damage" },
  { label: "Heal", value: "heal" },
  { label: "Cast", value: "cast" },
  { label: "Aura", value: "aura" },
  { label: "Slain", value: "slain" },
  { label: "Resource", value: "resource_change" },
  { label: "Extra Attack", value: "extra_attack" },
] as const;

/** Filter types that show the "applies to" event type selector */
const TYPES_WITH_APPLY_TO = new Set<PanelFilterType>([
  "source_type", "target_type",
  "ability_name", "ability_id", "ability_school", "ability_hittype",
]);

export interface FilterBlockProps {
  filter: PanelFilter;
  onChange: (next: PanelFilter) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function toInputValue(value: string | string[]): string {
  return Array.isArray(value) ? value.join(", ") : value;
}

function toArrayValue(value: string | string[]): string[] {
  return Array.isArray(value)
    ? value
    : value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
}

/** Combined dropdown for entity type editors — shows Identity + Type groups with section headers in one dropdown. */
function CompactGroupedDropdown({ groups, values, onToggle }: {
  groups: { label: string; options: readonly { label: string; value: string }[] }[];
  values: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const allOptions = groups.flatMap((g) => g.options);
  const selectedLabels = allOptions.filter((o) => values.includes(o.value)).map((o) => o.label);
  const summary = selectedLabels.length === 0
    ? "Select…"
    : selectedLabels.length <= 2
      ? selectedLabels.join(", ")
      : `${selectedLabels.length} selected`;

  return (
    <div className="relative">
      <button
        type="button"
        className="h-7 rounded-md border border-input bg-background text-foreground px-1.5 text-xs flex items-center gap-1 min-w-0"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      >
        <span className="truncate max-w-[160px]">{summary}</span>
        <span className="text-[8px]">▼</span>
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-0.5 left-0 min-w-[160px] rounded-md border border-input bg-background shadow-lg py-1 max-h-[200px] overflow-auto styled-scrollbar">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="px-2 pt-1.5 pb-0.5 text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                {group.label}
              </div>
              {group.options.map((opt) => {
                const selected = values.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`w-full text-left px-2 py-1 text-xs flex items-center gap-1.5 hover:bg-muted/60 ${
                      selected ? "text-foreground" : "text-muted-foreground"
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onToggle(opt.value);
                    }}
                  >
                    <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center text-[10px] ${
                      selected ? "bg-primary border-primary text-white" : "border-input"
                    }`}>
                      {selected && "✓"}
                    </span>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Compact dropdown for narrow containers — multi-select via checkboxes in a native select isn't great,
 *  so we use a small dropdown that shows selected count + toggles on click. */
function CompactDropdownToggle({ options, values, onToggle, multiSelect = true }: {
  options: readonly { label: string; value: string; color?: string }[];
  values: string[];
  onToggle: (value: string) => void;
  multiSelect?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabels = options.filter((o) => values.includes(o.value)).map((o) => o.label);
  const summary = selectedLabels.length === 0
    ? "None"
    : selectedLabels.length <= 2
      ? selectedLabels.join(", ")
      : `${selectedLabels.length} selected`;

  if (!multiSelect) {
    return (
      <select
        className="h-7 rounded-md border border-input bg-background text-foreground px-1.5 text-xs min-w-0"
        value={values[0] ?? ""}
        onChange={(e) => {
          const val = e.target.value;
          if (val) onToggle(val);
        }}
      >
        <option value="">None</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="h-7 rounded-md border border-input bg-background text-foreground px-1.5 text-xs flex items-center gap-1 min-w-0"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      >
        <span className="truncate max-w-[120px]">{summary}</span>
        <span className="text-[8px]">▼</span>
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-0.5 left-0 min-w-[140px] rounded-md border border-input bg-background shadow-lg py-1 max-h-[200px] overflow-auto styled-scrollbar">
          {options.map((opt) => {
            const selected = values.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                className={`w-full text-left px-2 py-1 text-xs flex items-center gap-1.5 hover:bg-muted/60 ${
                  selected ? "text-foreground" : "text-muted-foreground"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onToggle(opt.value);
                }}
              >
                <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center text-[10px] ${
                  selected ? "bg-primary border-primary text-white" : "border-input"
                }`}>
                  {selected && "✓"}
                </span>
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Segmented toggle for a set of string options — shows buttons on wide panels, dropdown on narrow */
function SegmentedToggle({ options, values, onToggle, multiSelect = true }: {
  options: readonly { label: string; value: string; color?: string }[];
  values: string[];
  onToggle: (value: string) => void;
  /** When false, renders a single-select dropdown in narrow mode. Default true (multi-select). */
  multiSelect?: boolean;
}) {
  return (
    <>
      {/* Wide: button row */}
      <div className="hidden filter-wide:flex flex-wrap items-center gap-1">
        {options.map((opt) => {
          const selected = values.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                selected
                  ? `${opt.color ?? "bg-primary"} text-white`
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => onToggle(opt.value)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {/* Narrow: compact dropdown */}
      <div className="filter-wide:hidden">
        <CompactDropdownToggle options={options} values={values} onToggle={onToggle} multiSelect={multiSelect} />
      </div>
    </>
  );
}

function AbilityIdChip({ id, onRemove }: { id: string; onRemove: () => void }) {
  const spellId = parseInt(id, 10);
  const { data: spell } = useSpell(
    isNaN(spellId) ? "" : spellId.toString(),
    { enabled: !isNaN(spellId) && spellId > 0 },
  );

  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/20 text-primary text-xs font-medium">
      {spell ? <SpellIconWithTooltip spell={spell} size={16}>{id}</SpellIconWithTooltip> : id}
      <button type="button" onClick={onRemove} className="hover:text-red-400 ml-0.5 leading-none">×</button>
    </span>
  );
}

function AbilityIdEditor({ filter, onChange }: { filter: PanelFilter; onChange: (next: PanelFilter) => void }) {
  const arrayValues = toArrayValue(filter.value);
  const [input, setInput] = useState("");

  const addEntry = useCallback((raw: string) => {
    const entry = raw.trim();
    if (!entry || arrayValues.includes(entry)) return;
    const num = parseInt(entry, 10);
    if (isNaN(num) || num <= 0) return;
    onChange({ ...filter, value: [...arrayValues, entry] });
    setInput("");
  }, [arrayValues, filter, onChange]);

  const removeEntry = useCallback((entry: string) => {
    onChange({ ...filter, value: arrayValues.filter((v) => v !== entry) });
  }, [arrayValues, filter, onChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addEntry(input);
    }
    if (e.key === "Backspace" && input === "" && arrayValues.length > 0) {
      removeEntry(arrayValues[arrayValues.length - 1]);
    }
  }, [input, arrayValues, addEntry, removeEntry]);

  const handleBlur = useCallback(() => {
    if (input.trim()) addEntry(input);
  }, [input, addEntry]);

  return (
    <div className="flex flex-wrap items-center gap-1 px-1 py-0.5 rounded border border-input bg-background/60 min-h-[28px] flex-1 min-w-[100px]">
      {arrayValues.map((entry) => (
        <AbilityIdChip key={entry} id={entry} onRemove={() => removeEntry(entry)} />
      ))}
      <input
        className="flex-1 min-w-[60px] bg-transparent text-xs outline-none placeholder:text-muted-foreground py-0.5"
        type="number"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={arrayValues.length === 0 ? "spell ID, press Enter" : "add more…"}
      />
    </div>
  );
}

/** Chip/badge for a custom entry (name or GUID) */
function CustomBadge({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/20 text-primary text-xs font-medium">
      {label}
      <button type="button" onClick={onRemove} className="hover:text-red-400 ml-0.5 leading-none">×</button>
    </span>
  );
}

/** Chip input for ability names — type a name and press Enter or comma to add. */
function AbilityNameEditor({ filter, onChange }: { filter: PanelFilter; onChange: (next: PanelFilter) => void }) {
  const arrayValues = toArrayValue(filter.value);
  const [input, setInput] = useState("");

  const addEntry = useCallback((raw: string) => {
    const entry = raw.trim();
    if (!entry || arrayValues.includes(entry)) return;
    onChange({ ...filter, value: [...arrayValues, entry] });
    setInput("");
  }, [arrayValues, filter, onChange]);

  const removeEntry = useCallback((entry: string) => {
    onChange({ ...filter, value: arrayValues.filter((v) => v !== entry) });
  }, [arrayValues, filter, onChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addEntry(input);
    }
    if (e.key === "Backspace" && input === "" && arrayValues.length > 0) {
      removeEntry(arrayValues[arrayValues.length - 1]);
    }
  }, [input, arrayValues, addEntry, removeEntry]);

  const handleBlur = useCallback(() => {
    if (input.trim()) addEntry(input);
  }, [input, addEntry]);

  return (
    <div className="flex flex-wrap items-center gap-1 px-1 py-0.5 rounded border border-input bg-background/60 min-h-[28px] flex-1 min-w-[100px]">
      {arrayValues.map((entry) => (
        <CustomBadge key={entry} label={entry} onRemove={() => removeEntry(entry)} />
      ))}
      <input
        className="flex-1 min-w-[60px] bg-transparent text-xs outline-none placeholder:text-muted-foreground py-0.5"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={arrayValues.length === 0 ? "ability name, press Enter" : "add more…"}
      />
    </div>
  );
}

/** Combined toggle + custom text input for source_type / target_type */
function EntityTypeEditor({ filter, onChange }: { filter: PanelFilter; onChange: (next: PanelFilter) => void }) {
  const arrayValues = toArrayValue(filter.value);
  const [customInput, setCustomInput] = useState("");

  const toggleValues = arrayValues.filter((v) => SOURCE_TYPE_KEYS.has(v));
  const customValues = arrayValues.filter((v) => !SOURCE_TYPE_KEYS.has(v));
  const showCustomInput = toggleValues.includes("custom");

  const toggleValue = useCallback((val: string) => {
    if (toggleValues.includes(val)) {
      // Deselect: keep only custom entries
      onChange({ ...filter, value: customValues });
    } else {
      // Select: replace previous toggle with this one, keep custom entries
      const next = val === "custom"
        ? [val, ...customValues]
        : [val];
      onChange({ ...filter, value: next });
    }
  }, [toggleValues, customValues, filter, onChange]);

  const addCustomEntry = useCallback((raw: string) => {
    const entry = raw.trim();
    if (!entry || arrayValues.includes(entry)) return;
    onChange({ ...filter, value: [...arrayValues, entry] });
    setCustomInput("");
  }, [arrayValues, filter, onChange]);

  const removeCustomEntry = useCallback((entry: string) => {
    onChange({ ...filter, value: arrayValues.filter((v) => v !== entry) });
  }, [arrayValues, filter, onChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addCustomEntry(customInput);
    }
    if (e.key === "Backspace" && customInput === "" && customValues.length > 0) {
      removeCustomEntry(customValues[customValues.length - 1]);
    }
  }, [customInput, customValues, addCustomEntry, removeCustomEntry]);

  const handleBlur = useCallback(() => {
    if (customInput.trim()) addCustomEntry(customInput);
  }, [customInput, addCustomEntry]);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {/* Wide: two labeled toggle rows */}
      <div className="hidden filter-wide:flex filter-wide:flex-row filter-wide:flex-wrap filter-wide:items-center gap-1 filter-wide:gap-x-3 filter-wide:gap-y-1">
        <div className="flex items-center gap-1">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground mr-0.5">Identity</span>
          <SegmentedToggle options={SOURCE_TYPE_IDENTITY_OPTIONS} values={toggleValues} onToggle={toggleValue} multiSelect={false} />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground mr-0.5">Type</span>
          <SegmentedToggle options={SOURCE_TYPE_TYPE_OPTIONS} values={toggleValues} onToggle={toggleValue} />
        </div>
      </div>
      {/* Narrow: single combined dropdown with grouped sections */}
      <div className="filter-wide:hidden">
        <CompactGroupedDropdown
          groups={[
            { label: "Identity", options: SOURCE_TYPE_IDENTITY_OPTIONS },
            { label: "Type", options: SOURCE_TYPE_TYPE_OPTIONS },
          ]}
          values={toggleValues}
          onToggle={toggleValue}
        />
      </div>
      {showCustomInput && (
        <div className="flex flex-wrap items-center gap-1 px-1 py-0.5 rounded border border-input bg-background/60 min-h-[28px]">
          {customValues.map((entry) => (
            <CustomBadge key={entry} label={entry} onRemove={() => removeCustomEntry(entry)} />
          ))}
          <input
            className="flex-1 min-w-[80px] bg-transparent text-xs outline-none placeholder:text-muted-foreground py-0.5"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder="name or GUID, press Enter"
          />
        </div>
      )}
    </div>
  );
}

/** Time range editor: "By Controller" toggle or manual start/end seconds */
function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function TimeRangeEditor({ filter, onChange }: { filter: PanelFilter; onChange: (next: PanelFilter) => void }) {
  const raw = typeof filter.value === "string" ? filter.value : (filter.value[0] ?? "");
  const isController = raw === "controller";
  const timeRange = useTimeRangeContextOptional();
  const totalDurationMs = timeRange?.totalDurationMs ?? 0;

  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);

  // Parse current start/end ms from filter value
  const [startMsStr, endMsStr] = isController ? ["", ""] : raw.split(",");
  const startMs = startMsStr ? Number(startMsStr) : 0;
  const endMs = endMsStr ? Number(endMsStr) : totalDurationMs;

  const startPct = totalDurationMs > 0 ? (startMs / totalDurationMs) * 100 : 0;
  const endPct = totalDurationMs > 0 ? (endMs / totalDurationMs) * 100 : 100;

  const getPositionPct = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    return Math.max(0, Math.min(100, pct));
  }, []);

  const pctToMs = useCallback((pct: number) => {
    return Math.round((pct / 100) * totalDurationMs);
  }, [totalDurationMs]);

  const handlePointerDown = useCallback((handle: "start" | "end") => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(handle);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const pct = getPositionPct(e.clientX);
    const ms = pctToMs(pct);
    if (dragging === "start") {
      const clamped = Math.min(ms, endMs);
      onChange({ ...filter, value: `${clamped},${endMs}` });
    } else {
      const clamped = Math.max(ms, startMs);
      onChange({ ...filter, value: `${startMs},${clamped}` });
    }
  }, [dragging, getPositionPct, pctToMs, startMs, endMs, onChange, filter]);

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
        <input
          type="checkbox"
          checked={isController}
          onChange={(e) => {
            if (e.target.checked) {
              onChange({ ...filter, value: "controller" });
            } else {
              onChange({ ...filter, value: "," });
            }
          }}
          className="rounded"
        />
        By Controller
      </label>
      {!isController && (
        totalDurationMs <= 0 ? (
          <p className="text-xs text-muted-foreground">Select encounters to use time range.</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {/* Time labels */}
            <div className="text-center text-xs text-foreground font-medium">
              {formatMs(startMs)} – {formatMs(endMs)}
            </div>

            {/* Dual-handle slider track */}
            <div
              ref={trackRef}
              className="relative h-5 cursor-pointer select-none touch-none"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {/* Track background */}
              <div className="absolute top-2 left-0 right-0 h-1 bg-muted rounded-full" />

              {/* Active range highlight */}
              <div
                className="absolute top-2 h-1 bg-primary rounded-full"
                style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
              />

              {/* Start handle */}
              <div
                className="absolute top-0.5 w-3 h-3 bg-primary rounded-full border-2 border-background shadow cursor-grab active:cursor-grabbing"
                style={{ left: `${startPct}%`, transform: "translateX(-50%)" }}
                onPointerDown={handlePointerDown("start")}
              />

              {/* End handle */}
              <div
                className="absolute top-0.5 w-3 h-3 bg-primary rounded-full border-2 border-background shadow cursor-grab active:cursor-grabbing"
                style={{ left: `${endPct}%`, transform: "translateX(-50%)" }}
                onPointerDown={handlePointerDown("end")}
              />
            </div>

            {/* Total duration labels */}
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0:00</span>
              <span>{formatMs(totalDurationMs)}</span>
            </div>
          </div>
        )
      )}
    </div>
  );
}

function ValueEditor({ filter, onChange }: { filter: PanelFilter; onChange: (next: PanelFilter) => void }) {
  const arrayValues = toArrayValue(filter.value);

  const toggleValue = (val: string) => {
    const next = arrayValues.includes(val)
      ? arrayValues.filter((v) => v !== val)
      : [...arrayValues, val];
    onChange({ ...filter, value: next });
  };

  switch (filter.type) {
    case "ability_school":
      return <SegmentedToggle options={SCHOOL_OPTIONS} values={arrayValues} onToggle={toggleValue} />;
    case "ability_hittype":
      return <SegmentedToggle options={HITTYPE_OPTIONS} values={arrayValues} onToggle={toggleValue} />;
    case "source_type":
    case "target_type":
      return <EntityTypeEditor filter={filter} onChange={onChange} />;
    case "ability_id":
      return <AbilityIdEditor filter={filter} onChange={onChange} />;
    case "ability_name":
      return <AbilityNameEditor filter={filter} onChange={onChange} />;
    case "time_range":
      return <TimeRangeEditor filter={filter} onChange={onChange} />;
    default:
      return (
        <Input
          className="h-7 text-xs flex-1 min-w-[100px]"
          value={toInputValue(filter.value)}
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
          placeholder="comma-separated values"
        />
      );
  }
}

function ApplyToSelector({ filter, onChange }: { filter: PanelFilter; onChange: (next: PanelFilter) => void }) {
  const current = filter.applyTo ?? [];
  const toggleApplyTo = (val: string) => {
    const next = current.includes(val)
      ? current.filter((v) => v !== val)
      : [...current, val];
    onChange({ ...filter, applyTo: next.length > 0 ? next : undefined });
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">on:</span>
      <div className="flex flex-wrap gap-0.5">
        {APPLY_TO_OPTIONS.map((opt) => {
          const active = current.length === 0 || current.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleApplyTo(opt.value)}
              className={`px-1.5 py-px rounded text-[9px] font-medium transition-colors ${
                active
                  ? "bg-zinc-600/50 text-zinc-200"
                  : "bg-zinc-800/30 text-zinc-600 hover:text-zinc-400"
              }`}
              title={`${active ? "Disable" : "Enable"} for ${opt.label} events`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FilterBlock({ filter, onChange, onRemove, onMoveUp, onMoveDown }: FilterBlockProps) {
  return (
    <div className="@container flex flex-col gap-1.5 p-2 rounded border border-border/60 bg-background/40">
      {/* Row 1: Toolbar — controls cluster */}
      <div className="flex items-center gap-2">
        {/* Reorder buttons */}
        <div className="shrink-0 flex flex-col -my-1">
          <button
            type="button"
            disabled={!onMoveUp}
            onClick={onMoveUp}
            className="text-[10px] leading-none text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-default p-0.5"
          >
            ▲
          </button>
          <button
            type="button"
            disabled={!onMoveDown}
            onClick={onMoveDown}
            className="text-[10px] leading-none text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-default p-0.5"
          >
            ▼
          </button>
        </div>

        {/* Negate toggle */}
        <button
          type="button"
          onClick={() => onChange({ ...filter, negate: !filter.negate })}
          className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
            filter.negate
              ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
              : "bg-zinc-700/30 text-zinc-500 hover:bg-zinc-700/50 hover:text-zinc-300"
          }`}
          title={filter.negate ? "Click to remove NOT" : "Click to negate"}
        >
          {filter.negate ? "NOT" : "IS"}
        </button>

        {/* Type selector */}
        <select
          className="h-7 shrink-0 rounded-md border border-input bg-background text-foreground px-1.5 text-xs"
          value={filter.type}
          onChange={(e) => onChange({ ...filter, type: e.target.value as PanelFilterType })}
        >
          {FILTER_TYPES.map((opt) => (
            <option className="bg-background text-foreground" key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {/* Wide layout: value editor inline */}
        <div className="hidden filter-wide:flex flex-1 items-center">
          <ValueEditor filter={filter} onChange={onChange} />
        </div>

        {/* Wide layout: applyTo + remove inline */}
        {TYPES_WITH_APPLY_TO.has(filter.type) && (
          <div className="hidden filter-wide:flex">
            <ApplyToSelector filter={filter} onChange={onChange} />
          </div>
        )}
        <Button className="shrink-0 h-7 w-7 p-0 hidden filter-wide:flex" variant="ghost" size="sm" onClick={onRemove}>✕</Button>

        {/* Narrow layout: value editor inline + spacer + remove */}
        <div className="flex-1 flex items-center filter-wide:hidden">
          <ValueEditor filter={filter} onChange={onChange} />
        </div>
        <Button className="shrink-0 h-7 w-7 p-0 filter-wide:hidden" variant="ghost" size="sm" onClick={onRemove}>✕</Button>
      </div>

      {/* Row 3: ApplyTo (narrow only) */}
      {TYPES_WITH_APPLY_TO.has(filter.type) && (
        <div className="filter-wide:hidden">
          <ApplyToSelector filter={filter} onChange={onChange} />
        </div>
      )}
    </div>
  );
}
