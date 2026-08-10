/* eslint-disable react-refresh/only-export-components -- draft converters are shared with profile management. */
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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

/**
 * The per-stat weight editor: every canonical stat, grouped, with
 * non-zero entries highlighted.
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
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-2xs uppercase tracking-wide text-zinc-500">
            Targets and caps
          </div>
          <p className="text-2xs text-zinc-600">
            Warnings only. Targets never change weighted scores. Target settings
            are stored in this browser for now.
          </p>
        </div>
        <button
          type="button"
          disabled={available.length === 0}
          onClick={() => {
            const stat = available[0];
            if (stat)
              onChange([
                ...targets,
                { stat: stat.key, type: "minimum", value: 0 },
              ]);
          }}
          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-600 disabled:opacity-40"
        >
          Add target
        </button>
      </div>
      {targets.length === 0 ? (
        <p className="rounded border border-dashed border-zinc-800 px-3 py-2 text-xs text-zinc-600">
          No targets configured for this profile.
        </p>
      ) : (
        <div className="space-y-1.5">
          {targets.map((target, index) => (
            <div
              key={`${target.stat}-${index}`}
              className="grid grid-cols-[minmax(0,1fr)_7rem_5rem_auto] items-center gap-2"
            >
              <select
                value={target.stat}
                onChange={(event) =>
                  onChange(
                    targets.map((entry, i) =>
                      i === index
                        ? { ...entry, stat: event.target.value }
                        : entry,
                    ),
                  )
                }
                className="h-8 min-w-0 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200"
              >
                {STAT_KEYS.filter(
                  (stat) =>
                    stat.key === target.stat ||
                    !targets.some((entry) => entry.stat === stat.key),
                ).map((stat) => (
                  <option key={stat.key} value={stat.key}>
                    {stat.label}
                  </option>
                ))}
              </select>
              <select
                value={target.type}
                onChange={(event) =>
                  onChange(
                    targets.map((entry, i) =>
                      i === index
                        ? {
                            ...entry,
                            type: event.target.value as StatTarget["type"],
                          }
                        : entry,
                    ),
                  )
                }
                className="h-8 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200"
              >
                <option value="minimum">Minimum</option>
                <option value="maximum">Maximum</option>
              </select>
              <Input
                type="number"
                step="0.1"
                value={target.value}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  onChange(
                    targets.map((entry, i) =>
                      i === index
                        ? {
                            ...entry,
                            value: Number.isFinite(value) ? value : 0,
                          }
                        : entry,
                    ),
                  );
                }}
                className="h-8 px-2 text-xs font-mono"
                aria-label={`${STAT_KEYS.find((stat) => stat.key === target.stat)?.label ?? target.stat} target`}
              />
              <button
                type="button"
                onClick={() => onChange(targets.filter((_, i) => i !== index))}
                className="px-1 text-zinc-600 hover:text-red-400"
                aria-label="Remove target"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function WeightSetForm({
  draft,
  onChange,
}: {
  draft: WeightDraft;
  onChange: (draft: WeightDraft) => void;
}) {
  return (
    <div className="space-y-3">
      {STAT_GROUPS.map((group) => {
        const keys = STAT_KEYS.filter((s) => s.group === group);
        return (
          <div key={group}>
            <div className="text-2xs uppercase tracking-wide text-zinc-500 mb-1">
              {group}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1">
              {keys.map((stat) => (
                <label
                  key={stat.key}
                  className="flex items-center justify-between gap-2"
                >
                  <span
                    className={cn(
                      "text-xs",
                      draft[stat.key] && parseFloat(draft[stat.key]) !== 0
                        ? "text-zinc-200"
                        : "text-zinc-500",
                    )}
                  >
                    {stat.label}
                  </span>
                  <Input
                    type="number"
                    step="0.1"
                    className="h-6 w-16 text-xs font-mono px-1.5"
                    value={draft[stat.key] ?? ""}
                    onChange={(e) =>
                      onChange({ ...draft, [stat.key]: e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
