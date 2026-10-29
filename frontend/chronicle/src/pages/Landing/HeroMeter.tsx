import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Heart, Skull, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClassIcon } from "@/pages/RaidPlanner/ClassIcon";
import type { HeroMeterData, HeroMeterDeath, HeroMeterPane, HeroMeterTotals } from "./heroMeter";

/** Bars the meter shows. */
const TOP_ROWS = 5;

// The run page's labels and icons for these panels (EventsPanel's PANELS, without pulling in its registry).
const PANES: { value: HeroMeterPane; label: string; icon: ReactNode }[] = [
  { value: "damage_done", label: "Damage Done", icon: <Swords className="h-4 w-4" /> },
  { value: "healing_done", label: "Healing Done", icon: <Heart className="h-4 w-4" /> },
  { value: "deaths", label: "Deaths", icon: <Skull className="h-4 w-4" /> },
];

const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** The run page's panel dropdown trigger, with this meter's three panes. */
function PaneSelector({ value, onChange }: { value: HeroMeterPane; onChange: (pane: HeroMeterPane) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = PANES.find((pane) => pane.value === value) ?? PANES[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex cursor-pointer items-center gap-1.5 bg-transparent text-sm font-medium text-foreground transition-colors hover:text-muted-foreground"
      >
        {selected.icon}
        {selected.label}
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div role="listbox" className="absolute left-0 top-full z-30 mt-1 flex w-48 flex-col rounded-md border bg-popover p-1 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95">
          {PANES.map((pane) => (
            <button
              key={pane.value}
              type="button"
              role="option"
              aria-selected={pane.value === value}
              onClick={() => {
                setOpen(false);
                onChange(pane.value);
              }}
              className={cn("flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent", pane.value === value && "bg-accent/50")}
            >
              <span className="text-muted-foreground">{pane.icon}</span>
              {pane.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DeathLine({ death }: { death: HeroMeterDeath }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs">
      <Skull className="h-3.5 w-3.5 shrink-0 text-[#f0a8a8]" aria-hidden />
      <span className="shrink-0 font-semibold" style={{ color: `var(--color-class-${death.className.toLowerCase()})` }}>{death.victim}</span>
      <span className="min-w-0 truncate text-muted-foreground">
        {death.ability ? <>to <span className="text-foreground/85">{death.ability}</span></> : "died"}
        {death.amount ? ` ${NUMBER.format(death.amount)}` : ""}
        {death.source && death.source !== death.ability ? ` · ${death.source}` : ""}
      </span>
      <span className="ml-auto shrink-0 font-mono text-muted-foreground">{formatClock(death.atMs)}</span>
    </div>
  );
}

function Bars({ totals, unit }: { totals: HeroMeterTotals; unit: string }) {
  const top = totals.rows[0]?.perSecond ?? 0;
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-lg font-semibold text-foreground">{COMPACT.format(totals.total)}</span>
        <span className="text-xs text-muted-foreground">raid {unit} <span className="font-mono text-foreground">{NUMBER.format(totals.perSecond)}</span></span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {totals.rows.slice(0, TOP_ROWS).map((row) => (
          <li key={row.name} className="relative flex h-6 items-center gap-2 overflow-hidden rounded-sm bg-white/5 pr-2 text-xs">
            <span
              aria-hidden
              className="absolute inset-y-0 left-0"
              style={{ width: `${top > 0 ? (row.perSecond / top) * 100 : 0}%`, background: `var(--color-class-${row.className.toLowerCase()})`, opacity: 0.55 }}
            />
            <ClassIcon cls={row.className} className="relative h-6 w-6 shrink-0" />
            <span className="relative min-w-0 truncate font-medium text-white [text-shadow:0_1px_2px_rgba(0,0,0,.8)]">{row.name}</span>
            <span className="relative ml-auto shrink-0 font-mono text-white [text-shadow:0_1px_2px_rgba(0,0,0,.8)]">{NUMBER.format(row.perSecond)}</span>
            <span className="relative w-9 shrink-0 text-right font-mono text-white/70 [text-shadow:0_1px_2px_rgba(0,0,0,.8)]">{Math.round(row.share * 100)}%</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * The hero's glass meter: the playing pull's numbers in the run page's panel
 * chrome, its header the run page's pane dropdown. `sourceKey` names the run
 * the numbers belong to; a new one crossfades the body. A pane without
 * numbers yet (a clip carries damage only) shows a loading line.
 */
export function HeroMeter({ data, sourceKey, pane, onPaneChange, className }: {
  data: HeroMeterData;
  sourceKey: string;
  pane: HeroMeterPane;
  onPaneChange: (pane: HeroMeterPane) => void;
  className?: string;
}) {
  const totals = pane === "damage_done" ? data.damage : pane === "healing_done" ? data.healing : null;
  const firstDeath = data.deaths[0];
  return (
    <div className={cn("flex flex-col gap-2.5 rounded-lg border border-white/10 bg-card/60 p-3 shadow-lg backdrop-blur-md", className)}>
      <div className="flex items-center justify-between gap-2">
        <PaneSelector value={pane} onChange={onPaneChange} />
      </div>
      <div key={`${sourceKey}-${pane}`} className="flex flex-col gap-2 animate-in fade-in-0 duration-500">
        {pane === "deaths" ? (
          data.deaths.length > 0
            ? data.deaths.slice(0, TOP_ROWS + 1).map((death, i) => <DeathLine key={i} death={death} />)
            : <div className="text-xs text-muted-foreground">No one died on this pull.</div>
        ) : totals ? (
          <>
            <Bars totals={totals} unit={pane === "damage_done" ? "DPS" : "HPS"} />
            {firstDeath && <DeathLine death={firstDeath} />}
          </>
        ) : (
          <div className="text-xs text-muted-foreground">Loading the live replay…</div>
        )}
      </div>
      <a href="#runs" className="text-xs text-link no-underline hover:underline">
        Healing, threat, the whole replay: below
      </a>
    </div>
  );
}
