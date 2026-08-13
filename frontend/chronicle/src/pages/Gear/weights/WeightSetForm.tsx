/* eslint-disable react-refresh/only-export-components -- draft converters are shared with profile management. */
import { useState } from "react";
import { Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu";
import { Input } from "@/components/ui/input";
import {
  STAT_GROUPS,
  STAT_KEYS,
  type StatTarget,
  type StatWeights,
} from "../builder/gearScoring";

/** Draft weights as raw input strings, keyed by canonical stat key. */
export type WeightDraft = Record<string, string>;

export function draftFromWeights(weights: StatWeights): WeightDraft {
  return Object.fromEntries(
    Object.entries(weights).map(([k, v]) => [k, String(v)]),
  );
}

export function weightsFromDraft(draft: WeightDraft): StatWeights {
  const weights: StatWeights = {};
  for (const [key, raw] of Object.entries(draft)) {
    const v = parseFloat(raw);
    if (Number.isFinite(v) && v !== 0) weights[key] = v;
  }
  return weights;
}

const STAT_LABEL = new Map(STAT_KEYS.map((s) => [s.key, s.label]));

const BARE_NUMBER_INPUT =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/**
 * Raw-stat targets as inline pills: stat, a ≥/≤ toggle, and the value.
 */
export function TargetSetForm({
  targets,
  onChange,
}: {
  targets: StatTarget[];
  onChange: (targets: StatTarget[]) => void;
}) {
  const available = STAT_KEYS.filter(
    (stat) => !targets.some((target) => target.stat === stat.key),
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-2xs uppercase tracking-wide text-zinc-600">
        Targets
      </span>
      {targets.map((target, index) => (
        <span
          key={`${target.stat}-${index}`}
          className="inline-flex items-center gap-1 rounded-full border border-sky-900/80 py-0.5 pl-2.5 pr-1 text-xs text-sky-300"
        >
          <select
            value={target.stat}
            onChange={(event) =>
              onChange(
                targets.map((entry, i) =>
                  i === index ? { ...entry, stat: event.target.value } : entry,
                ),
              )
            }
            className="cursor-pointer appearance-none bg-transparent outline-none"
            style={{
              width: `${(STAT_LABEL.get(target.stat) ?? target.stat).length + 1}ch`,
            }}
          >
            {STAT_KEYS.filter(
              (stat) =>
                stat.key === target.stat ||
                !targets.some((entry) => entry.stat === stat.key),
            ).map((stat) => (
              <option
                key={stat.key}
                value={stat.key}
                className="bg-zinc-900 text-zinc-200"
              >
                {stat.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            title={
              target.type === "minimum"
                ? "At least — click for at most"
                : "At most — click for at least"
            }
            onClick={() =>
              onChange(
                targets.map((entry, i) =>
                  i === index
                    ? {
                        ...entry,
                        type: entry.type === "minimum" ? "maximum" : "minimum",
                      }
                    : entry,
                ),
              )
            }
            className="px-0.5 hover:text-sky-100"
          >
            {target.type === "minimum" ? "≥" : "≤"}
          </button>
          <input
            type="number"
            step="0.1"
            value={target.value}
            onChange={(event) => {
              const value = Number(event.target.value);
              onChange(
                targets.map((entry, i) =>
                  i === index
                    ? { ...entry, value: Number.isFinite(value) ? value : 0 }
                    : entry,
                ),
              );
            }}
            className={`w-14 bg-transparent text-right font-mono text-xs text-sky-200 outline-none ${BARE_NUMBER_INPUT}`}
            aria-label={`${STAT_LABEL.get(target.stat) ?? target.stat} target`}
          />
          <button
            type="button"
            onClick={() => onChange(targets.filter((_, i) => i !== index))}
            className="px-1 text-zinc-600 hover:text-red-400"
            aria-label="Remove target"
          >
            ×
          </button>
        </span>
      ))}
      <button
        type="button"
        disabled={available.length === 0}
        onClick={() => {
          const stat = available[0];
          if (stat)
            onChange([...targets, { stat: stat.key, type: "minimum", value: 0 }]);
        }}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-600 px-2.5 py-0.5 text-xs text-zinc-300 hover:border-zinc-400 hover:text-zinc-100 disabled:opacity-40"
      >
        <Plus className="h-3 w-3" />
        Target
      </button>
      <span className="ml-1 text-2xs text-zinc-600">
        warnings only — never change scores; stored in this browser
      </span>
    </div>
  );
}

/**
 * The weight editor: only the stats the set actually weights, ranked
 * with bars; everything else is behind “+ Add stat”.
 */
export function WeightSetForm({
  draft,
  onChange,
}: {
  draft: WeightDraft;
  onChange: (draft: WeightDraft) => void;
}) {
  // Ranked once on mount so rows don't jump around while a value is being
  // typed; newly added stats append and get ranked on the next open.
  const [order, setOrder] = useState<string[]>(() =>
    Object.keys(draft).sort(
      (a, b) => (parseFloat(draft[b]) || 0) - (parseFloat(draft[a]) || 0),
    ),
  );
  const max =
    Math.max(...order.map((k) => Math.abs(parseFloat(draft[k]) || 0)), 0) || 1;
  const available = STAT_KEYS.filter((s) => !order.includes(s.key));

  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-2xs uppercase tracking-wide text-zinc-600">
          Weights
        </span>
        <span className="text-2xs text-zinc-600">
          {order.length} {order.length === 1 ? "stat" : "stats"}
        </span>
        <span className="h-px flex-1 self-center bg-zinc-800" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={available.length === 0}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-600 px-3 py-0.5 text-xs text-zinc-300 hover:border-zinc-400 hover:text-zinc-100 disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
              Add stat
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
            {STAT_GROUPS.map((group) => {
              const stats = available.filter((s) => s.group === group);
              if (stats.length === 0) return null;
              return (
                <DropdownMenuGroup key={group}>
                  <DropdownMenuLabel className="text-2xs uppercase tracking-wide text-zinc-500">
                    {group}
                  </DropdownMenuLabel>
                  {stats.map((s) => (
                    <DropdownMenuItem
                      key={s.key}
                      onSelect={() => {
                        setOrder((prev) => [...prev, s.key]);
                        onChange({ ...draft, [s.key]: "" });
                      }}
                    >
                      {s.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {order.length === 0 ? (
        <p className="rounded border border-dashed border-zinc-800 px-3 py-2 text-xs text-zinc-600">
          No weights yet — add a stat to start scoring items.
        </p>
      ) : (
        <div className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
          {order.map((key) => {
            const value = Math.abs(parseFloat(draft[key]) || 0);
            return (
              <div
                key={key}
                className="group -mx-1.5 flex items-center gap-2.5 rounded px-1.5 py-1 hover:bg-zinc-800/50"
              >
                <span className="w-28 shrink-0 truncate text-xs text-zinc-200">
                  {STAT_LABEL.get(key) ?? key}
                </span>
                <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-chart-5/75"
                    style={{ width: `${(value / max) * 100}%` }}
                  />
                </div>
                <Input
                  type="number"
                  step="0.1"
                  value={draft[key] ?? ""}
                  onChange={(e) =>
                    onChange({ ...draft, [key]: e.target.value })
                  }
                  className={`h-7 w-16 shrink-0 px-1.5 text-right font-mono text-xs ${BARE_NUMBER_INPUT}`}
                />
                <button
                  type="button"
                  onClick={() => {
                    setOrder((prev) => prev.filter((k) => k !== key));
                    const next = { ...draft };
                    delete next[key];
                    onChange(next);
                  }}
                  className="shrink-0 px-0.5 text-zinc-700 hover:text-red-400 group-hover:text-zinc-500"
                  aria-label={`Remove ${STAT_LABEL.get(key) ?? key}`}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
