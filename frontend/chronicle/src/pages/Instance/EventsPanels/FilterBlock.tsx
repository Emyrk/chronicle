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
  { value: "event_type", label: "Event Type" },
];

const SCHOOL_OPTIONS = [
  { label: "Physical", value: "physical" },
  { label: "Holy", value: "holy" },
  { label: "Fire", value: "fire" },
  { label: "Nature", value: "nature" },
  { label: "Frost", value: "frost" },
  { label: "Shadow", value: "shadow" },
  { label: "Arcane", value: "arcane" },
] as const;

export interface FilterBlockProps {
  filter: PanelFilter;
  onChange: (next: PanelFilter) => void;
  onRemove: () => void;
}

function toInputValue(value: string | string[]): string {
  return Array.isArray(value) ? value.join(",") : value;
}

function toArrayValue(value: string | string[]): string[] {
  return Array.isArray(value)
    ? value
    : value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
}

export function FilterBlock({ filter, onChange, onRemove }: FilterBlockProps) {
  const schoolValues = toArrayValue(filter.value);

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-2 p-2 rounded border border-border/60 bg-background/40">
      <select
        className="md:col-span-4 h-9 rounded-md border border-input bg-background text-foreground px-2 text-sm"
        value={filter.type}
        onChange={(event) => onChange({ ...filter, type: event.target.value as PanelFilterType })}
      >
        {FILTER_TYPES.map((option) => (
          <option className="bg-background text-foreground" key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <select
        className="md:col-span-3 h-9 rounded-md border border-input bg-background text-foreground px-2 text-sm"
        value={filter.mode}
        onChange={(event) => onChange({ ...filter, mode: event.target.value as PanelFilter["mode"] })}
      >
        <option className="bg-background text-foreground" value="include">Include</option>
        <option className="bg-background text-foreground" value="exclude">Exclude</option>
      </select>

      {filter.type === "ability_school" ? (
        <div className="md:col-span-4 flex flex-wrap items-center gap-1 rounded-md border border-input px-2 py-1 min-h-9">
          {SCHOOL_OPTIONS.map((school) => {
            const selected = schoolValues.includes(school.value);
            return (
              <button
                key={school.value}
                type="button"
                className={selected
                  ? "px-2 py-0.5 rounded text-xs bg-primary text-primary-foreground"
                  : "px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground hover:text-foreground"
                }
                onClick={() => {
                  const next = selected
                    ? schoolValues.filter((value) => value !== school.value)
                    : [...schoolValues, school.value];
                  onChange({ ...filter, value: next });
                }}
              >
                {school.label}
              </button>
            );
          })}
        </div>
      ) : (
        <Input
          className="md:col-span-4 h-9"
          value={toInputValue(filter.value)}
          onChange={(event) => onChange({ ...filter, value: event.target.value })}
          placeholder={filter.type === "players" || filter.type === "enemies" ? "selected or guid" : "comma-separated values"}
        />
      )}

      <Button className="md:col-span-1 h-9" variant="ghost" size="sm" onClick={onRemove}>✕</Button>
    </div>
  );
}
