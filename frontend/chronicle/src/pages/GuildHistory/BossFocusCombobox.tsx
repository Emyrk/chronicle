import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronsUpDown, Crosshair, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CLEAR_PART_LABELS, focusLabel, NO_FOCUS, type ClearPart, type GuildFocus } from "./guildHistoryModel";

interface FocusOption {
  key: string;
  focus: GuildFocus;
  label: string;
}

const PART_OPTIONS: readonly FocusOption[] = (Object.keys(CLEAR_PART_LABELS) as ClearPart[]).map((part) => ({
  key: `part:${part}`,
  focus: { boss: "", part },
  label: CLEAR_PART_LABELS[part],
}));

/**
 * Type to pick what the chart and summary measure: whole clears, one part of each clear
 * (boss, trash or idle time), or a single boss's kill times.
 */
export function BossFocusCombobox({
  bosses,
  value,
  onChange,
  className,
}: {
  bosses: readonly string[];
  value: GuildFocus;
  onChange: (focus: GuildFocus) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = query.trim().toLowerCase();
  const focused = !!value.boss || !!value.part;
  // Keep a focused boss listed even when the current filters have no kills of it.
  const names = value.boss && !bosses.includes(value.boss) ? [value.boss, ...bosses] : bosses;
  const bossOptions = names.map((name) => ({ key: `boss:${name}`, focus: { boss: name, part: "" as const }, label: name }));
  const options = [
    { key: "clear", focus: NO_FOCUS, label: "Whole clear" },
    ...PART_OPTIONS,
    ...bossOptions,
  ].filter((option) => !search || option.label.toLowerCase().includes(search));
  const selectedKey = value.boss ? `boss:${value.boss}` : value.part ? `part:${value.part}` : "clear";
  const firstBossIndex = options.findIndex((option) => option.key.startsWith("boss:"));

  useEffect(() => {
    const close = (event: globalThis.MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const choose = (focus: GuildFocus) => {
    onChange(focus);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlightedIndex((current) => Math.min(current + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && open && options[highlightedIndex]) {
      event.preventDefault();
      choose(options[highlightedIndex].focus);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
      event.currentTarget.blur();
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex h-8 items-center gap-2 rounded-md border bg-background px-2.5 focus-within:border-sky-500/70",
          focused ? "border-sky-500/60" : "border-border",
        )}
      >
        <Crosshair className={cn("h-3.5 w-3.5 shrink-0", focused ? "text-sky-400" : "text-muted-foreground")} />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="What to measure"
          aria-expanded={open}
          aria-controls="boss-focus-options"
          aria-activedescendant={open && options[highlightedIndex] ? `boss-focus-${highlightedIndex}` : undefined}
          autoComplete="off"
          placeholder="Search bosses…"
          value={open ? query : focusLabel(value)}
          onFocus={() => {
            setOpen(true);
            setQuery("");
            setHighlightedIndex(Math.max(0, options.findIndex((option) => option.key === selectedKey)));
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setHighlightedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground",
            !open && !focused && "text-muted-foreground",
          )}
        />
        {focused && !open ? (
          <button
            type="button"
            onClick={() => choose(NO_FOCUS)}
            className="rounded p-0.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
            aria-label="Back to whole clears"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
      </div>

      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-xl">
          <div id="boss-focus-options" role="listbox" className="max-h-80 overflow-y-auto p-1 styled-scrollbar">
            {options.length > 0 ? options.map((option, index) => (
              <div key={option.key}>
                {index === firstBossIndex && index > 0 && (
                  <div className="mx-2 mt-1 border-t border-border/60 pt-1.5 pb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Bosses
                  </div>
                )}
                <button
                  id={`boss-focus-${index}`}
                  type="button"
                  role="option"
                  aria-selected={option.key === selectedKey}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => choose(option.focus)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors",
                    index === highlightedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                  )}
                >
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    {option.key === selectedKey && <Check className="h-3.5 w-3.5 text-sky-400" />}
                  </span>
                  {option.label}
                </button>
              </div>
            )) : (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">Nothing matches “{query}”</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
