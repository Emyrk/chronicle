import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ComboInput } from "./ComboInput";
import { toOptions, type Suggestion } from "./comboOptions";

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
  options: { value: string; label: string; icon?: ReactNode }[];
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
              "px-2 py-0.5 rounded text-2xs font-medium transition-colors disabled:cursor-not-allowed inline-flex items-center gap-1",
              active ? "bg-primary/20 text-primary ring-1 ring-primary/40" : "bg-zinc-800/40 text-zinc-400 hover:text-zinc-200",
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Several values as removable chips, with a dropdown of suggestions. Enter or
 * comma adds the typed text; Backspace on an empty box removes the last chip.
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
  suggestions?: readonly Suggestion[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const v = raw.trim();
    setDraft("");
    if (!v || values.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    onChange([...values, v]);
  };
  return (
    <ComboInput
      text={draft}
      onTextChange={setDraft}
      options={toOptions(suggestions)}
      exclude={values}
      onPick={(o) => add(o.value)}
      onEnterText={add}
      onBlurText={(t) => t && add(t)}
      onKeyDown={(e) => {
        if (e.key === ",") {
          e.preventDefault();
          add(draft);
        } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
          e.preventDefault();
          onChange(values.slice(0, -1));
        }
      }}
      placeholder={values.length ? "" : placeholder}
      disabled={disabled}
      className={cn("flex flex-wrap items-center gap-1 min-h-7 rounded-md border border-input bg-background px-1.5 py-0.5", disabled && "opacity-50", className)}
      inputClassName="flex-1 min-w-[90px] bg-transparent text-xs outline-none py-0.5"
    >
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded bg-zinc-700/60 px-1.5 py-px text-2xs text-zinc-200">
          {v}
          <button type="button" disabled={disabled} onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}>
            <X className="h-3 w-3 text-zinc-400 hover:text-zinc-100" />
          </button>
        </span>
      ))}
    </ComboInput>
  );
}

/** Text input with a dropdown of suggestions; any text is allowed. */
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
  suggestions?: readonly Suggestion[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <ComboInput
      text={value}
      onTextChange={onChange}
      options={toOptions(suggestions)}
      onPick={(o) => onChange(o.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      inputClassName="flex h-7 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-xs md:text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
    />
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
