import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { UnitIcon } from "./UnitIcon";
import { compareUnitSearchOptions, scoreUnitSearchMatch } from "./unitSearchMatch";

export type UnitSearchGroup = "player" | "friendly" | "enemy";

export interface UnitSearchOption {
  guid: string;
  name: string;
  relation: "friendly" | "hostile";
  group: UnitSearchGroup;
  className?: string;
  specializationIconUrl?: string;
}

interface UnitSearchProps {
  units: UnitSearchOption[];
  selectedGuids: ReadonlySet<string>;
  onToggle: (guid: string) => void;
  onClear: () => void;
}

export function UnitSearch({ units, selectedGuids, onToggle, onClear }: UnitSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = units.filter((unit) => selectedGuids.has(unit.guid));
  const singleSelected = selected.length === 1 ? selected[0] : null;

  // Keep the legacy singular name available across Vite Fast Refresh updates
  // while transitioning this picker from single-select to multi-select.
  const selectedGuid = singleSelected?.guid ?? null;

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

  const matches = useMemo(() => units
    .map((unit) => ({ unit, score: scoreUnitSearchMatch(query, unit) }))
    .filter((match): match is { unit: UnitSearchOption; score: number } => match.score !== null)
    .sort((a, b) => b.score - a.score || compareUnitSearchOptions(a.unit, b.unit))
    .slice(0, 80)
    .map(({ unit }) => unit), [query, units]);

  const handleClear = (event: MouseEvent) => {
    event.stopPropagation();
    onClear();
    setQuery("");
    setOpen(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
      event.currentTarget.blur();
    }
    if (event.key === "Enter" && matches.length === 1) {
      onToggle(matches[0].guid);
      setQuery("");
    }
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <div className={cn(
        "group flex h-8 items-center gap-2 rounded border border-border/80 bg-background/70 px-2",
        "shadow-inner transition-colors focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/25",
      )}>
        {selectedGuid && singleSelected && !open ? (
          <UnitIcon unit={singleSelected} className="size-5" />
        ) : (
          <Search className="size-4 shrink-0 text-muted-foreground transition-colors group-focus-within:text-primary" />
        )}
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-label="Search friendly and hostile units"
          placeholder="Search friendly or hostile units…"
          value={open ? query : singleSelected?.name ?? (selected.length > 1 ? `${selected.length} units selected` : "")}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
        />
        {selected.length > 0 && (
          <button
            type="button"
            aria-label="Clear selected units"
            onClick={handleClear}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-xl animate-in fade-in-0 zoom-in-95">
          <div className="max-h-72 overflow-y-auto p-1 styled-scrollbar">
            {matches.length > 0 ? matches.map((unit) => {
              const isSelected = selectedGuids.has(unit.guid);
              const groupLabel = unit.group === "player"
                ? "Player"
                : unit.group === "friendly"
                  ? "Friendly"
                  : "Enemy";
              return (
                <button
                  key={unit.guid}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onToggle(unit.guid);
                    setQuery("");
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    isSelected && "bg-accent/60",
                  )}
                >
                  <span className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded border",
                    isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                  )}>
                    {isSelected && <Check className="size-3" />}
                  </span>
                  <UnitIcon unit={unit} />
                  <span className="min-w-0 flex-1 truncate font-medium">{unit.name}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {groupLabel}
                  </span>
                </button>
              );
            }) : (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                No units match “{query}”
              </div>
            )}
          </div>
          <div className="border-t border-border/70 px-2.5 py-1.5 text-[10px] text-muted-foreground">
            {matches.length} of {units.length} units with recorded auras
          </div>
        </div>
      )}
    </div>
  );
}
