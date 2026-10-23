import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import type { InferenceModel } from "@/api/typesGenerated";
import { cn } from "@/lib/utils";
import { filterInferenceModels } from "./modelSearch";

interface ModelComboboxProps {
  models: readonly InferenceModel[];
  value: string | undefined;
  onChange: (value: string) => void;
}

function formatContextLength(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens);
}

export function ModelCombobox({ models, value, onChange }: ModelComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = models.find((model) => model.id === value);
  const matches = useMemo(() => filterInferenceModels(models, query), [models, query]);
  const visibleMatches = matches.slice(0, 100);

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

  const choose = (model: InferenceModel) => {
    onChange(model.id);
    setOpen(false);
    setQuery("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      if (visibleMatches.length > 0) {
        setHighlightedIndex((current) => Math.min(current + 1, visibleMatches.length - 1));
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && open && visibleMatches[highlightedIndex]) {
      event.preventDefault();
      choose(visibleMatches[highlightedIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
      event.currentTarget.blur();
    }
  };

  return (
    <div ref={rootRef} className="relative mt-1">
      <div className={cn(
        "border-input bg-background flex h-9 items-center gap-2 rounded-md border px-2",
        "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-3",
      )}>
        <Search className="text-muted-foreground size-3.5 shrink-0" />
        <input
          type="text"
          role="combobox"
          aria-label="Search AI models"
          aria-expanded={open}
          aria-controls="inference-model-options"
          aria-activedescendant={open && visibleMatches[highlightedIndex] ? `inference-model-${highlightedIndex}` : undefined}
          autoComplete="off"
          placeholder="Search models…"
          value={open ? query : selected?.name ?? ""}
          onFocus={() => {
            setOpen(true);
            setQuery("");
            setHighlightedIndex(0);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setHighlightedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0" />
      </div>

      {open && (
        <div className="bg-popover absolute inset-x-0 top-full z-[100] mt-1 overflow-hidden rounded-md border shadow-xl">
          <div id="inference-model-options" role="listbox" className="styled-scrollbar max-h-72 overflow-y-auto p-1">
            {visibleMatches.length > 0 ? visibleMatches.map((model, index) => {
              const isSelected = model.id === value;
              return (
                <button
                  id={`inference-model-${index}`}
                  key={model.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => choose(model)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded px-2 py-2 text-left transition-colors",
                    index === highlightedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                  )}
                >
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                    {isSelected && <Check className="text-primary size-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{model.name}</span>
                    <span className="text-muted-foreground block truncate font-mono text-[10px]">{model.id}</span>
                  </span>
                  <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
                    {formatContextLength(model.context_length)}
                  </span>
                </button>
              );
            }) : (
              <div className="text-muted-foreground px-3 py-6 text-center text-xs">
                No tool-capable models match “{query}”
              </div>
            )}
          </div>
          <div className="text-muted-foreground border-t px-2.5 py-1.5 text-[10px]">
            {matches.length === models.length
              ? `${models.length} tool-capable models`
              : `${matches.length} of ${models.length} tool-capable models`}
            {matches.length > visibleMatches.length && " · Refine your search to see more"}
          </div>
        </div>
      )}
    </div>
  );
}
