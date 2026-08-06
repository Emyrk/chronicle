import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert/Alert";
import { useRealms, useSiteConfig } from "@/api/queries";
import { useRankingsInstances } from "@/api/rankingsQueries";
import { useGearTrends } from "@/api/gearBuilderQueries";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { cn } from "@/lib/utils";
import { gearClassesForFlavor } from "../classInfo";
import { slotLabel } from "../builder/SlotEditorPanel";
import { orderedSlots, trendsState } from "./trendsModel";
import { TrendsTable } from "./TrendsTable";

const DAY_OPTIONS = [30, 60, 90] as const;

export function GearTrendsPage() {
  const { data: siteConfig } = useSiteConfig();
  const classes = useMemo(
    () => gearClassesForFlavor(siteConfig?.dataset_flavor ?? []),
    [siteConfig?.dataset_flavor],
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const classParam = searchParams.get("class") ?? "";
  const specParam = searchParams.get("spec") ?? "";
  const daysParam = Number(searchParams.get("days"));
  const days = (DAY_OPTIONS as readonly number[]).includes(daysParam) ? (daysParam as 30 | 60 | 90) : 60;

  const selectedClass = classes.find((c) => c.enumName === classParam);
  const spec = selectedClass && selectedClass.specs.includes(specParam) ? specParam : "";

  // Raid + realm cohort filters.
  const instances = useRankingsInstances();
  const raidOptions = useMemo(
    () => [...new Set((instances.data ?? []).map((i) => i.instance_name))],
    [instances.data],
  );
  const raidParam = searchParams.get("raid") ?? "";
  const raid = raidOptions.includes(raidParam) ? raidParam : "";
  const realms = useRealms();
  const realmParam = searchParams.get("realm") ?? "";
  const realm = (realms.data ?? []).find((r) => r.id === realmParam);

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === "") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    setSearchParams(next, { replace: true });
  };

  const trends = useGearTrends(
    selectedClass && spec
      ? { class: selectedClass.enumName, spec, days, raid: raid || undefined, realmId: realm?.id }
      : null,
  );
  const state = trendsState(trends.data, trends.isLoading && !!selectedClass && !!spec);
  const slots = trends.data ? orderedSlots(trends.data) : [];
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const shownSlot =
    slots.find((s) => s.slot === activeSlot) ?? slots[0];

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Observed equipment, not a recommendation</AlertTitle>
        <AlertDescription>
          These are the items the spec's top-parsing players were wearing during their best
          performances. Popularity does not measure upgrade value and does not prove an item
          caused higher performance — raid access, loot priority, and drop rates all influence
          what players wear.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center gap-1.5">
        {classes.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setParams({ class: c.enumName === classParam ? null : c.enumName, spec: null })}
            className={cn(
              "px-2.5 py-1 rounded-full text-xs border transition-colors",
              c.enumName === classParam
                ? "border-blue-500 bg-blue-500/10"
                : "border-zinc-700 hover:border-zinc-500",
            )}
            style={{ color: getClassColorVar(c.enumName) }}
          >
            {c.name}
          </button>
        ))}
      </div>

      {selectedClass && (
        <div className="flex flex-wrap items-center gap-1.5">
          {selectedClass.specs.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setParams({ spec: s })}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs border transition-colors",
                s === spec
                  ? "border-blue-500 bg-blue-500/10 text-white"
                  : "border-zinc-700 text-zinc-400 hover:text-zinc-200",
              )}
            >
              {s}
            </button>
          ))}
          <span className="mx-1 text-zinc-700">|</span>
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setParams({ days: d === 60 ? null : String(d) })}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs border transition-colors",
                d === days
                  ? "border-blue-500 bg-blue-500/10 text-white"
                  : "border-zinc-700 text-zinc-400 hover:text-zinc-200",
              )}
            >
              {d} days
            </button>
          ))}
          <span className="mx-1 text-zinc-700">|</span>
          <select
            className="h-7 rounded border border-zinc-700 bg-zinc-900 px-1.5 text-xs text-zinc-300"
            value={raid}
            onChange={(e) => setParams({ raid: e.target.value || null })}
          >
            <option value="">All raids</option>
            {raidOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select
            className="h-7 rounded border border-zinc-700 bg-zinc-900 px-1.5 text-xs text-zinc-300"
            value={realm?.id ?? ""}
            onChange={(e) => setParams({ realm: e.target.value || null })}
          >
            <option value="">All realms</option>
            {(realms.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {!selectedClass || !spec ? (
        <p className="text-sm text-zinc-500">Pick a class and spec to see what its logged players wear.</p>
      ) : state === "loading" ? (
        <p className="text-sm text-zinc-500">Building the cohort…</p>
      ) : state === "insufficient" ? (
        <div className="rounded-md border border-zinc-700/60 bg-zinc-900/40 p-6 text-sm text-zinc-400">
          <p>
            Only <span className="font-mono">{trends.data?.cohort_size ?? 0}</span> unique{" "}
            {spec} {selectedClass.name}s had ranked parses with gear snapshots
            {raid ? ` in ${raid}` : ""}
            {realm ? ` on ${realm.name}` : ""} in the last {days} days — below the minimum
            sample of {trends.data?.min_sample_size ?? 5}.
          </p>
          <p className="text-zinc-500 mt-1">
            Results under the threshold are hidden rather than shown as misleading percentages.
            Try a longer window or fewer filters.
          </p>
        </div>
      ) : state === "empty" ? (
        <p className="text-sm text-zinc-500">No gear snapshots found for this cohort.</p>
      ) : (
        trends.data && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500">
              <span style={{ color: getClassColorVar(selectedClass.enumName) }}>
                {spec} {selectedClass.name}
              </span>{" "}
              · top <span className="font-mono">{trends.data.cohort_size}</span>
              {trends.data.cohort_size < trends.data.top_performances
                ? ` (of a possible ${trends.data.top_performances})`
                : ""}{" "}
              performances{raid ? ` in ${raid}` : ""}
              {realm ? ` on ${realm.name}` : ""}, each observed in the gear worn during that
              parse · generated {new Date(trends.data.generated_at).toLocaleString()}
            </p>
            <div className="flex flex-wrap gap-1">
              {slots.map((s) => (
                <button
                  key={s.slot}
                  type="button"
                  onClick={() => setActiveSlot(s.slot)}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs border transition-colors",
                    shownSlot && s.slot === shownSlot.slot
                      ? "border-blue-500 bg-blue-500/10 text-white"
                      : "border-zinc-700 text-zinc-400 hover:text-zinc-200",
                  )}
                >
                  {slotLabel(s.slot)}
                </button>
              ))}
            </div>
            {shownSlot && <TrendsTable slot={shownSlot} cohortSize={trends.data.cohort_size} />}
            <p className="text-2xs text-zinc-500">
              Methodology: the cohort is the top {trends.data.top_performances} unique players
              by their best ranked parse (one parse per player); each observation is the gear
              snapshot from that parse's raid night. Duplicate log uploads are collapsed;
              cohorts under {trends.data.min_sample_size} players are hidden entirely. Item
              identity is the functional item ID; enchants are counted separately.
            </p>
          </div>
        )
      )}
    </div>
  );
}
