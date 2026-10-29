import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Heart, Skull, Swords } from "lucide-react";
import type { PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { cn } from "@/lib/utils";
import { MeterBars } from "@/pages/Instance/EventsPanels/MeterBars";
import { trackFunnel, type MeterDrillPlacement } from "@/utils/funnel";
import { RUN_PAGE_PANELS, runPageHref, type HeroMeterBreakouts, type HeroMeterData, type HeroMeterDeath, type HeroMeterDrillPane, type HeroMeterPane, type HeroMeterTotals } from "./heroMeter";

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

/** The player a bar click drilled into, on the pane and pull it was clicked on (null pull: a clip's bar). */
interface Drill {
  pane: HeroMeterDrillPane;
  name: string;
  className: string;
  encounterId: string | null;
}

const classColor = (className: string) => `var(--color-class-${className.toLowerCase()})`;

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
        {death.source && death.source !== death.ability && death.source !== death.victim ? ` · ${death.source}` : ""}
      </span>
      <span className="ml-auto shrink-0 font-mono text-muted-foreground">{formatClock(death.atMs)}</span>
    </div>
  );
}

function Bars({ totals, unit, rows, onOpen, onDrill }: {
  totals: HeroMeterTotals;
  unit: string;
  rows: number;
  onOpen: (() => void) | null | undefined;
  onDrill: (row: PlayerMetricChartData) => void;
}) {
  const data = useMemo((): PlayerMetricChartData[] => totals.rows.map((row) => ({
    playerID: row.name,
    playerName: row.name,
    className: row.className,
    specialization: "",
    value: row.perSecond,
  })), [totals]);
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-lg font-semibold text-foreground">{COMPACT.format(totals.total)}</span>
        <span className="text-xs text-muted-foreground">raid {unit} <span className="font-mono text-foreground">{NUMBER.format(totals.perSecond)}</span></span>
      </div>
      {/* Shares of the raid's rate, not of the rows shown: a clip's manifest carries its top five only. */}
      <MeterBars
        data={data}
        onOpen={onOpen ?? undefined}
        onOpenRow={onOpen === undefined ? onDrill : undefined}
        openLabel={onOpen === undefined ? "Their abilities on this pull" : "Show the stats"}
        values={{ formatValue: (value) => NUMBER.format(value), shareBase: totals.perSecond, formatShare: (share) => `${Math.round(share * 100)}%`, limit: rows }}
      />
    </>
  );
}

/** A drilled-in player's breakout at the cursor: total, rate and share of the raid, top abilities, a facts line. */
function Breakout({ drill, breakouts, unit }: { drill: Drill; breakouts: HeroMeterBreakouts; unit: string }) {
  const breakout = breakouts.player(drill.pane, drill.name);
  const data = useMemo((): PlayerMetricChartData[] => (breakout?.abilities ?? []).map((ability) => ({
    playerID: ability.name,
    playerName: ability.name,
    className: drill.className,
    specialization: "",
    value: ability.perSecond,
  })), [breakout, drill.className]);
  if (!breakout) return <div className="text-xs text-muted-foreground">Nothing yet at this point of the pull.</div>;
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-lg font-semibold text-foreground">{COMPACT.format(breakout.total)}</span>
        <span className="text-xs text-muted-foreground">
          {unit} <span className="font-mono text-foreground">{NUMBER.format(breakout.perSecond)}</span>
          {" · "}<span className="font-mono text-foreground">{Math.round(breakout.raidShare * 100)}%</span> of raid
        </span>
      </div>
      {/* Shares of the player's own total. */}
      <MeterBars
        data={data}
        openLabel=""
        values={{ formatValue: (value) => NUMBER.format(value), shareBase: breakout.perSecond, formatShare: (share) => `${Math.round(share * 100)}%` }}
      />
      {breakout.facts.length > 0 && (
        <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
          {breakout.facts.map((fact) => (
            <span key={fact.label}>
              {fact.label === "targets" || fact.label === "target"
                ? <><span className="font-mono text-foreground">{fact.value}</span> {fact.label}</>
                : <>{fact.label} <span className="font-mono text-foreground">{fact.value}</span></>}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * The hero's glass meter: the playing pull's numbers in the run page's panel
 * chrome, its header the run page's pane dropdown. `sourceKey` names the run
 * the numbers belong to; a new one crossfades the body. A pane without
 * numbers yet (a clip carries damage only) shows a loading line. `rows` caps the bars (5).
 * A bar click on Damage Done or Healing Done drills into that player's breakout at the cursor (← comes back; a new
 * pane or pull leaves it), calling `onDrill` (the hero: bring the live replay, a clip has no breakouts) and sending
 * `meter_drill` with `placement`. `onOpen` replaces that (null: nothing). With `run`, a footer links the run page
 * on the pane's preset. `action` sits right of the dropdown.
 */
export function HeroMeter({ data, sourceKey, pane, onPaneChange, className, rows = TOP_ROWS, onOpen, onDrill, placement = "hero", run, action }: {
  data: HeroMeterData;
  sourceKey: string;
  pane: HeroMeterPane;
  onPaneChange: (pane: HeroMeterPane) => void;
  className?: string;
  rows?: number;
  onOpen?: (() => void) | null;
  onDrill?: () => void;
  placement?: MeterDrillPlacement;
  run?: { id: string; slug?: string | null } | null;
  action?: ReactNode;
}) {
  const totals = pane === "damage_done" ? data.damage : pane === "healing_done" ? data.healing : null;
  const firstDeath = data.deaths[0];
  const breakouts = data.breakouts ?? null;
  const encounterId = breakouts?.encounterId ?? null;
  const [drill, setDrill] = useState<Drill | null>(null);
  // Another pane or pull leaves the drill-in; a clip's drill-in takes the live pull once it plays, unless the live
  // run lacks that player (the clip can be another run).
  if (drill && (drill.pane !== pane || (drill.encounterId !== null && encounterId !== null && drill.encounterId !== encounterId))) setDrill(null);
  else if (drill && drill.encounterId === null && breakouts) setDrill(breakouts.hasPlayer(drill.name) ? { ...drill, encounterId: breakouts.encounterId } : null);
  const drillInto = (row: PlayerMetricChartData) => {
    if (pane === "deaths") return;
    // The live replay without a pull has no breakouts to show.
    if (!breakouts && data.run) return;
    setDrill({ pane, name: row.playerName, className: row.className, encounterId });
    trackFunnel("meter_drill", { pane, placement });
    onDrill?.();
  };
  const unit = pane === "damage_done" ? "DPS" : "HPS";
  const paneLabel = PANES.find((candidate) => candidate.value === pane)?.label ?? "";
  return (
    <div className={cn("flex flex-col gap-2.5 rounded-lg border border-white/10 bg-card/60 p-3 shadow-lg backdrop-blur-md", className)}>
      <div className="flex items-center justify-between gap-2">
        {drill ? (
          <button
            type="button"
            onClick={() => setDrill(null)}
            aria-label={`Back to ${paneLabel}`}
            className="flex min-w-0 cursor-pointer items-center gap-1.5 bg-transparent text-sm font-medium text-foreground transition-colors hover:text-muted-foreground"
          >
            {/* A glyph, not lucide's ArrowLeft: that icon would be its own chunk before /start paints. */}
            <span className="shrink-0" aria-hidden>←</span>
            <span className="truncate font-semibold" style={{ color: classColor(drill.className) }}>{drill.name}</span>
            <span className="shrink-0 text-muted-foreground">· {paneLabel}</span>
          </button>
        ) : (
          <PaneSelector value={pane} onChange={onPaneChange} />
        )}
        <div className="flex shrink-0 items-center gap-2">
          {drill && breakouts && <span className="font-mono text-[10px] text-muted-foreground">{formatClock(breakouts.elapsedMs)}</span>}
          {action}
        </div>
      </div>
      <div key={`${sourceKey}-${pane}-${drill?.name ?? ""}`} className="flex flex-col gap-2 animate-in fade-in-0 duration-500">
        {drill ? (
          breakouts
            ? <Breakout drill={drill} breakouts={breakouts} unit={unit} />
            : <div className="text-xs text-muted-foreground">Loading the live replay…</div>
        ) : pane === "deaths" ? (
          data.deaths.length > 0
            ? data.deaths.slice(0, TOP_ROWS + 1).map((death, i) => <DeathLine key={i} death={death} />)
            : <div className="text-xs text-muted-foreground">No one died on this pull.</div>
        ) : totals ? (
          <>
            <Bars totals={totals} unit={unit} rows={rows} onOpen={onOpen} onDrill={drillInto} />
            {firstDeath && <DeathLine death={firstDeath} />}
          </>
        ) : (
          <div className="text-xs text-muted-foreground">Loading the live replay…</div>
        )}
      </div>
      {run && (
        <div className="text-xs text-muted-foreground">
          Any player, any spell, any ten seconds.{" "}
          <Link to={runPageHref(run, pane)} className="text-link no-underline hover:underline">
            {RUN_PAGE_PANELS}+ panels on the run page →
          </Link>
        </div>
      )}
    </div>
  );
}
