import { lazy, Suspense, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, ExternalLink, EyeOff, GitCompareArrows, Lock, Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { billingTierLabel, TIER_COLOR } from "@/pages/Settings/billingPricing";
import {
  entityAttributes,
  entityKey,
  guildCompareUrl,
  instanceOverviewUrl,
  killTimeLeaderboardUrl,
  performanceCompareUrl,
  type EntityKind,
  type EntityRef,
} from "./entity";
import { KIND_LABEL, kindColor, MAX_COMPARE, QUICK_RANGE_DAYS, QUICK_RANGES, STATS_TIER, useQuickRange } from "./entityCompare";
import type { EntityRaidContext } from "./entityMenuContext";

const QuickStats = lazy(() => import("./QuickStats"));

type Encounter = Extract<EntityRef, { kind: "encounter" }>;

/** Where the tray's footer link goes for the kind on show. */
function pageLink(kind: EntityKind, entities: EntityRef[], hidden: ReadonlySet<string>): { to: string; label: string } {
  if (kind === "character") {
    return { to: performanceCompareUrl(entities as Extract<EntityRef, { kind: "character" }>[], hidden), label: "Open performance history" };
  }
  if (kind === "guild") {
    return { to: guildCompareUrl(entities as Extract<EntityRef, { kind: "guild" }>[], hidden), label: "Open clear-time history" };
  }
  // Pulls from one log compare on its Overview; pulls from several fall back to the boss leaderboard.
  const encounters = entities as Encounter[];
  return new Set(encounters.map((encounter) => encounter.logId)).size === 1
    ? { to: instanceOverviewUrl(encounters[0].logId), label: "Open log overview" }
    : { to: killTimeLeaderboardUrl(encounters[0]), label: "Open kill time leaderboard" };
}

/**
 * The corner card for players, guilds and encounters added with "Add to compare". It shows their
 * quick stats (one entity: a short summary; several: a comparison). Player and guild stats need
 * the stats tier, and below it show a blurred preview with an upgrade prompt; encounter kill times
 * are free. Everyone can open the full page from here.
 */
export function CompareTray({
  pins,
  hidden,
  raid,
  canShowStats,
  onRemove,
  onToggleHidden,
  onClear,
  onExpand,
}: {
  pins: EntityRef[];
  /** Entity keys left out of the stats but kept in the tray (Shift+click a name). */
  hidden: ReadonlySet<string>;
  raid: EntityRaidContext | null;
  canShowStats: boolean;
  onRemove: (entity: EntityRef) => void;
  onToggleHidden: (entity: EntityRef) => void;
  onClear: (kind: EntityKind) => void;
  onExpand: (kind: EntityKind) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [range, setRange] = useQuickRange();
  // A choice holds until something new is added; then the card follows the newest pin.
  const [chosen, setChosen] = useState<{ kind: EntityKind; count: number } | null>(null);
  if (pins.length === 0) return null;
  const groups = (["character", "guild", "encounter"] as const)
    .map((kind) => ({ kind, entities: pins.filter((pin) => pin.kind === kind) }))
    .filter((group) => group.entities.length > 0);
  const latestKind = pins[pins.length - 1].kind;
  const kind =
    chosen && chosen.count === pins.length && groups.some((group) => group.kind === chosen.kind) ? chosen.kind : latestKind;
  const entities = groups.find((group) => group.kind === kind)!.entities;
  const isEncounter = kind === "encounter";
  const showStats = canShowStats || isEncounter;
  const link = pageLink(kind, entities, hidden);
  const iconButton = "rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground";

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="flex items-center gap-2 rounded-full border bg-popover px-3 py-2 text-xs font-medium shadow-lg hover:bg-accent"
        aria-label="Show compare tray"
      >
        <GitCompareArrows className="h-4 w-4 text-sky-400" />
        Compare
        {groups.map((group) => (
          <span
            key={group.kind}
            className="rounded-full px-1.5 tabular-nums"
            style={{ backgroundColor: `color-mix(in oklab, ${kindColor(group.kind)} 25%, transparent)` }}
          >
            {group.entities.length}
          </span>
        ))}
        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    );
  }

  return (
    <section
      aria-label="Compare tray"
      className="w-[min(380px,calc(100vw-2rem))] rounded-lg border bg-popover text-popover-foreground shadow-xl"
    >
      <header className="flex items-center gap-1 border-b px-2 py-1.5">
        <GitCompareArrows className="mx-1 h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
        {groups.length > 1 ? (
          groups.map((group) => (
            <button
              key={group.kind}
              type="button"
              aria-pressed={group.kind === kind}
              onClick={() => setChosen({ kind: group.kind, count: pins.length })}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
                group.kind === kind ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: kindColor(group.kind) }} aria-hidden="true" />
              {group.entities.length}{" "}
              {/* Just the dot and count on phones, where the title bar also holds the range. */}
              <span className="max-sm:sr-only">{KIND_LABEL[group.kind][group.entities.length === 1 ? "one" : "many"]}</span>
            </button>
          ))
        ) : (
          <h2 className="text-xs font-semibold">Compare</h2>
        )}
        <span className="ml-auto" />
        {canShowStats && !isEncounter && (
          <div className="flex gap-0.5 rounded-md bg-white/5 p-0.5" role="group" aria-label="Range">
            {QUICK_RANGES.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={range === option}
                title={`Last ${QUICK_RANGE_DAYS[option]} days`}
                onClick={() => setRange(option)}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                  range === option ? "bg-white/15 text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        )}
        {canShowStats && !isEncounter && (
          <button type="button" onClick={() => onExpand(kind)} className={iconButton} aria-label="Expand to full stats" title="Full stats">
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}
        <button type="button" onClick={() => setCollapsed(true)} className={iconButton} aria-label="Minimize compare tray">
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="space-y-2.5 p-3">
        <div className="flex items-start gap-2">
          <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5" aria-label={`${KIND_LABEL[kind].many} in compare`}>
            {entities.map((entity) => {
              const isHidden = hidden.has(entityKey(entity));
              return (
              <li key={entityKey(entity)}>
                <span
                  {...entityAttributes(entity)}
                  className={cn("inline-flex items-center gap-1 rounded-md border py-0.5 pr-0.5 pl-2 text-xs", isHidden && "border-dashed opacity-50")}
                  style={{ borderColor: `color-mix(in oklab, ${kindColor(kind)} 40%, transparent)` }}
                >
                  <button
                    type="button"
                    aria-pressed={isHidden}
                    aria-label={isHidden ? `${entity.name}, hidden` : entity.name}
                    title={[
                      entity.kind === "encounter" ? new Date(entity.startTime).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "",
                      isHidden ? "Hidden from the stats. Shift+click to show" : "Shift+click to hide from the stats",
                    ].filter(Boolean).join(" · ")}
                    // Keep Shift+click from selecting text.
                    onMouseDown={(event) => event.shiftKey && event.preventDefault()}
                    onClick={(event) => event.shiftKey && onToggleHidden(entity)}
                    className="flex max-w-[120px] items-center gap-1 font-medium"
                    style={entity.kind === "character" && entity.className ? { color: getClassColorVar(entity.className) } : undefined}
                  >
                    {isHidden && <EyeOff className="h-3 w-3 shrink-0" aria-hidden="true" />}
                    <span className={cn("truncate", isHidden && "line-through")}>{entity.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(entity)}
                    className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label={`Remove ${entity.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              </li>
              );
            })}
          </ul>
          <div className="flex shrink-0 items-center gap-2 pt-0.5 text-[11px] text-muted-foreground">
            <span className="tabular-nums">
              {entities.length}/{MAX_COMPARE}
            </span>
            <button type="button" onClick={() => onClear(kind)} className="hover:text-foreground">
              Clear
            </button>
          </div>
        </div>

        {showStats ? (
          <Suspense fallback={<div className="h-32" />}>
            <QuickStats kind={kind} entities={entities} hidden={hidden} raid={raid} rangeDays={QUICK_RANGE_DAYS[range]} />
          </Suspense>
        ) : (
          <LockedPreview kind={kind} entities={entities.filter((entity) => !hidden.has(entityKey(entity)))} />
        )}

        <Link
          to={link.to}
          target="_blank"
          className="flex items-center justify-center gap-1.5 rounded-md bg-[color-mix(in_oklab,var(--kind)_15%,transparent)] px-3 py-1.5 text-xs font-medium text-[var(--kind)] transition-colors hover:bg-[color-mix(in_oklab,var(--kind)_25%,transparent)]"
          style={{ "--kind": kindColor(kind) } as CSSProperties}
        >
          {link.label}
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}

/** Deterministic made-up numbers so the blurred preview looks real without fetching anything. */
function fakeNumber(seed: string, low: number, high: number): number {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return low + ((Math.abs(hash) % 1000) / 1000) * (high - low);
}

/**
 * What quick stats would show, blurred, with the real names and invented numbers, under an
 * invitation to the tier that unlocks it.
 */
function LockedPreview({ kind, entities }: { kind: EntityKind; entities: EntityRef[] }) {
  const tierColor = TIER_COLOR[STATS_TIER];
  const value = (entity: EntityRef, salt: string) => {
    if (kind === "character") return fakeNumber(entity.name + salt, 70, 98).toFixed(1);
    const minutes = Math.round(fakeNumber(entity.name + salt, 55, 95));
    const seconds = Math.round(fakeNumber(`${entity.name}${salt}s`, 0, 59));
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  return (
    <div className="relative min-h-[164px] overflow-hidden rounded-md">
      <div aria-hidden="true" className="pointer-events-none space-y-2 select-none blur-[3px]">
        <div className="flex gap-1 text-xs">
          <span className="rounded bg-white/15 px-2.5 py-0.5">{kind === "guild" ? "Clear" : "Score"}</span>
          <span className="px-2.5 py-0.5 text-muted-foreground">Chart</span>
        </div>
        {entities.length === 1 ? (
          <div className="space-y-3">
            <div className="flex items-end gap-3">
              <div className="font-mono text-3xl font-bold leading-none" style={{ color: kind === "character" ? "#a335ee" : undefined }}>
                {value(entities[0], "focus")}
              </div>
              <div className="text-xs text-muted-foreground">
                <div className="font-medium text-foreground">This log</div>
                <div className="text-emerald-400">▲ better than typical · 3rd best of 24</div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 rounded-md bg-white/5 px-2.5 py-2">
              {["Typical", "Best", "Recent", kind === "character" ? "Consistency" : "Clears"].map((label) => (
                <div key={label}>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
                  <div className="font-mono text-sm font-semibold">
                    {label === "Consistency" ? "High" : label === "Clears" ? "18" : value(entities[0], label)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {entities.map((entity) => (
                <tr key={entityKey(entity)} className="border-t border-border/50 first:border-t-0">
                  <td className="py-1.5 font-medium">{entity.name}</td>
                  {["focus", "typical", "best"].map((salt) => (
                    <td key={salt} className="py-1.5 pl-2 text-right font-mono">
                      {value(entity, salt)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-popover/40 px-4 text-center">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <Lock className="h-3.5 w-3.5" style={{ color: tierColor }} aria-hidden="true" />
          {kind === "character" ? "See their scores right here" : "See their clear times right here"}
        </p>
        <p className="text-[11px] leading-snug text-muted-foreground">
          {billingTierLabel(STATS_TIER)} supporters see how {entities.length === 1 ? "they" : "everyone"} did on the fights you're
          viewing, their usual and their trend, without leaving the page.
        </p>
        <Link
          to="/supporter"
          target="_blank"
          className="rounded-md px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: tierColor }}
        >
          Become {billingTierLabel(STATS_TIER)}
        </Link>
      </div>
    </div>
  );
}
