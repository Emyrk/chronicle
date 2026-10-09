import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePortalContainer } from "@/components/ui/PortalContainerContext";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { InstancePlayer } from "@/api/typesGenerated";
import { SLOT_COLORS, SLOT_LABELS } from "../../EventsPanels/RotationTimeline/format";

interface PlayerPickerProps {
  slot: number;
  value: string | null;
  /** Players by total damage, highest first. */
  ranked: readonly [string, number][];
  players: Record<string, InstancePlayer>;
  /** Offer a "None" entry, which calls onChange(null). */
  allowNone?: boolean;
  onChange: (guid: string | null) => void;
}

interface Option {
  guid: string | null;
  name: string;
  cls: string | null;
  damage: number | null;
}

const classColor = (cls: string | null) => (cls ? `var(--color-class-${cls.toLowerCase()})` : undefined);

/** Searchable player select: type to filter by name or class, arrows + Enter to pick. */
export function PlayerPicker({ slot, value, ranked, players, allowNone, onChange }: PlayerPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const portalContainer = usePortalContainer();
  const current = value ? players[value] : undefined;

  const options = useMemo(() => {
    const query = search.trim().toLowerCase();
    const all: Option[] = ranked.flatMap(([guid, damage]) => {
      const p = players[guid];
      return p ? [{ guid, name: p.name, cls: p.class, damage }] : [];
    });
    const matches = query
      ? all.filter((o) => o.name.toLowerCase().includes(query) || (o.cls ?? "").toLowerCase().includes(query))
      : all;
    return allowNone && !query ? [{ guid: null, name: "None", cls: null, damage: null }, ...matches] : matches;
  }, [ranked, players, search, allowNone]);

  const close = () => {
    setOpen(false);
    setSearch("");
    setActive(0);
  };
  const pick = (option: Option | undefined) => {
    if (!option) return;
    onChange(option.guid);
    close();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(options.length - 1, Math.max(0, active + (e.key === "ArrowDown" ? 1 : -1)));
      setActive(next);
      listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(options[active]);
    }
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <PopoverPrimitive.Trigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <span
            className="flex size-4 items-center justify-center rounded-[3px] text-[10px] font-bold text-background"
            style={{ background: SLOT_COLORS[slot] }}
          >
            {SLOT_LABELS[slot]}
          </span>
          <span className="font-semibold" style={{ color: classColor(current?.class ?? null) }}>
            {current?.name ?? (allowNone ? "None" : "Pick player")}
          </span>
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal container={portalContainer}>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 w-64 rounded-md border border-border bg-popover text-popover-foreground shadow-md outline-none"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search players or classes..."
              aria-label="Search players"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div ref={listRef} className="styled-scrollbar max-h-80 overflow-y-auto p-1">
            {options.length === 0 && <p className="px-2 py-3 text-center text-xs text-muted-foreground">No players found</p>}
            {options.map((option, i) => (
              <button
                key={option.guid ?? "none"}
                type="button"
                onClick={() => pick(option)}
                onPointerMove={() => setActive(i)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-xs",
                  i === active && "bg-accent text-accent-foreground",
                  option.guid === value && i !== active && "bg-muted/50",
                )}
              >
                <span
                  className={cn("min-w-0 flex-1 truncate font-medium", option.guid == null && "text-muted-foreground")}
                  style={{ color: classColor(option.cls) }}
                >
                  {option.name}
                </span>
                {option.damage != null && (
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatNumber(option.damage)}</span>
                )}
              </button>
            ))}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
