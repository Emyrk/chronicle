import { useId, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/** Single-select pill toggle, styled like the panel filter toggles. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
  title,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 bg-muted/50 rounded-md p-0.5" title={title}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-2 py-0.5 text-2xs rounded transition-colors cursor-pointer disabled:cursor-not-allowed",
            value === opt.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Multi-select toggle chips for a known set of values. */
export function ToggleChips({
  options,
  values,
  onChange,
  disabled,
}: {
  options: { value: string; label: string }[];
  values: readonly string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((opt) => {
        const active = values.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(active ? values.filter((v) => v !== opt.value) : [...values, opt.value])}
            className={cn(
              "px-2 py-0.5 rounded text-2xs font-medium transition-colors disabled:cursor-not-allowed",
              active ? "bg-primary/20 text-primary ring-1 ring-primary/40" : "bg-zinc-800/40 text-zinc-400 hover:text-zinc-200",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Free-text chips: type a value (with suggestions) and press Enter to add it.
 * Used for boss and player name lists.
 */
export function ChipInput({
  values,
  onChange,
  suggestions = [],
  placeholder,
  disabled,
  className,
}: {
  values: readonly string[];
  onChange: (values: string[]) => void;
  suggestions?: readonly string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();
  const add = (raw: string) => {
    const v = raw.trim();
    if (!v || values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };
  return (
    <div className={cn("flex flex-wrap items-center gap-1 min-h-7 rounded-md border border-input bg-background px-1.5 py-0.5", disabled && "opacity-50", className)}>
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded bg-zinc-700/60 px-1.5 py-px text-2xs text-zinc-200">
          {v}
          <button type="button" disabled={disabled} onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}>
            <X className="h-3 w-3 text-zinc-400 hover:text-zinc-100" />
          </button>
        </span>
      ))}
      <input
        list={suggestions.length ? listId : undefined}
        disabled={disabled}
        value={draft}
        onChange={(e) => {
          // Picking a datalist suggestion fills the input; add it right away.
          const v = e.target.value;
          if (suggestions.includes(v)) add(v);
          else setDraft(v);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => draft && add(draft)}
        placeholder={values.length ? "" : placeholder}
        className="flex-1 min-w-[90px] bg-transparent text-xs outline-none py-0.5"
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}

/** Text input with optional suggestions. */
export function SuggestInput({
  value,
  onChange,
  suggestions = [],
  placeholder,
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions?: readonly string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const listId = useId();
  return (
    <>
      <Input
        list={suggestions.length ? listId : undefined}
        className={cn("h-7 text-xs", className)}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </>
  );
}

/** Number input that maps an empty box to null. */
export function NumberInput({
  value,
  onChange,
  placeholder,
  disabled,
  min,
  max,
  step,
  className,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      className={cn("h-7 text-xs w-20", className)}
      value={value ?? ""}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") return onChange(null);
        const n = Number(raw);
        onChange(Number.isFinite(n) ? n : null);
      }}
    />
  );
}

export const NATIVE_SELECT =
  "h-7 rounded-md border border-input bg-background text-foreground px-1.5 text-xs disabled:opacity-50";
