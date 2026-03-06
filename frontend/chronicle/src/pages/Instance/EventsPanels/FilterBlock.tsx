import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PanelFilter, PanelFilterType } from "./processors/filters";

const FILTER_TYPES: { value: PanelFilterType; label: string }[] = [
  { value: "players", label: "Players" },
  { value: "enemies", label: "Enemies" },
  { value: "ability_name", label: "Ability Name" },
  { value: "ability_id", label: "Ability ID" },
  { value: "ability_school", label: "Ability School" },
  { value: "source_type", label: "Source Type" },
  { value: "target_type", label: "Target Type" },
];

const SCHOOL_OPTIONS = [
  { label: "Physical", value: "physical", color: "bg-amber-700" },
  { label: "Holy", value: "holy", color: "bg-yellow-500" },
  { label: "Fire", value: "fire", color: "bg-orange-600" },
  { label: "Nature", value: "nature", color: "bg-green-600" },
  { label: "Frost", value: "frost", color: "bg-cyan-500" },
  { label: "Shadow", value: "shadow", color: "bg-purple-600" },
  { label: "Arcane", value: "arcane", color: "bg-pink-500" },
] as const;

const SOURCE_TYPE_OPTIONS = [
  { label: "Player", value: "player" },
  { label: "Pet", value: "pet" },
  { label: "Enemy Pet", value: "enemy_pet" },
  { label: "Enemy", value: "enemy" },
  { label: "Object", value: "object" },
] as const;

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
const TYPES_WITH_APPLY_TO = new Set<PanelFilterType>(["source_type", "target_type"]);

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

/** Segmented toggle for a set of string options */
function SegmentedToggle({ options, values, onToggle }: {
  options: readonly { label: string; value: string; color?: string }[];
  values: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
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
    case "source_type":
    case "target_type":
      return <SegmentedToggle options={SOURCE_TYPE_OPTIONS} values={arrayValues} onToggle={toggleValue} />;

    case "players":
    case "enemies":
      return (
        <Input
          className="h-7 text-xs flex-1 min-w-[100px]"
          value={toInputValue(filter.value)}
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
          placeholder="selected"
        />
      );
    case "ability_id":
      return (
        <Input
          className="h-7 text-xs w-24"
          type="number"
          value={toInputValue(filter.value)}
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
          placeholder="Spell ID"
        />
      );
    case "ability_name":
      return (
        <Input
          className="h-7 text-xs flex-1 min-w-[100px]"
          value={toInputValue(filter.value)}
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
          placeholder="ability name"
        />
      );
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
    <div className="shrink-0 flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground text-center">on</span>
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
    <div className="flex items-center gap-2 p-2 rounded border border-border/60 bg-background/40">
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

      {/* Value editor (type-specific) */}
      <div className="flex-1 flex items-center">
        <ValueEditor filter={filter} onChange={onChange} />
      </div>

      {/* "Applies to" event type selector */}
      {TYPES_WITH_APPLY_TO.has(filter.type) && (
        <ApplyToSelector filter={filter} onChange={onChange} />
      )}

      {/* Remove */}
      <Button className="shrink-0 h-7 w-7 p-0" variant="ghost" size="sm" onClick={onRemove}>✕</Button>
    </div>
  );
}
