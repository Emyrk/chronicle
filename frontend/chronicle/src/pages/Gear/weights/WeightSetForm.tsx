import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { STAT_GROUPS, STAT_KEYS, type StatWeights } from "../builder/gearScoring";

/** Draft weights as raw input strings, keyed by canonical stat key. */
export type WeightDraft = Record<string, string>;

export function draftFromWeights(weights: StatWeights): WeightDraft {
  return Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, String(v)]));
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
            <div className="text-2xs uppercase tracking-wide text-zinc-500 mb-1">{group}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1">
              {keys.map((stat) => (
                <label key={stat.key} className="flex items-center justify-between gap-2">
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
                    onChange={(e) => onChange({ ...draft, [stat.key]: e.target.value })}
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
