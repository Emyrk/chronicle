import { useMemo, useState } from "react";
import { ArrowUpDown, Loader2 } from "lucide-react";
import type { CensusEntry } from "@/api/typesGenerated";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { raceFaction, raceName } from "./censusRace";

interface PlayersTabProps {
  data: CensusEntry[] | undefined;
  isLoading: boolean;
  flavor: readonly string[];
}

export function PlayersTab({ data, isLoading, flavor }: PlayersTabProps) {
  // null = default (by total count), string = sort by that race column or class row
  const [sortByRace, setSortByRace] = useState<string | null>(null);
  const [sortByClass, setSortByClass] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (!data) return null;

    let total = 0;
    let horde = 0;
    let alliance = 0;
    let unknown = 0;
    const byClass = new Map<string, number>();
    const byRace = new Map<string, number>();

    for (const entry of data) {
      total += entry.count;
      const faction = raceFaction(entry.race, flavor);
      if (faction === "Horde") horde += entry.count;
      else if (faction === "Alliance") alliance += entry.count;
      else unknown += entry.count;

      byClass.set(entry.class, (byClass.get(entry.class) ?? 0) + entry.count);
      byRace.set(entry.race, (byRace.get(entry.race) ?? 0) + entry.count);
    }

    const classSorted = [...byClass.entries()].sort((a, b) => b[1] - a[1]);
    const raceSorted = [...byRace.entries()].sort((a, b) => b[1] - a[1]);
    const classMax = classSorted[0]?.[1] ?? 1;
    const raceMax = raceSorted[0]?.[1] ?? 1;

    // Build class+race combo matrix
    const comboMap = new Map<string, number>(); // "class|race" -> count
    let comboMax = 0;
    for (const entry of data) {
      const key = `${entry.class}|${entry.race}`;
      comboMap.set(key, entry.count);
      if (entry.count > comboMax) comboMax = entry.count;
    }

    const classNames = classSorted.map(([c]) => c);
    const raceNames = raceSorted.map(([r]) => r);

    return { total, horde, alliance, unknown, classSorted, raceSorted, classMax, raceMax, comboMap, comboMax, classNames, raceNames };
  }, [data, flavor]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats) return null;

  const knownTotal = stats.horde + stats.alliance;
  const hordePercent = knownTotal > 0 ? (stats.horde / knownTotal) * 100 : 50;
  const alliancePercent = knownTotal > 0 ? (stats.alliance / knownTotal) * 100 : 50;

  return (
    <div className="space-y-8">
      {/* Summary */}
      <div className={`grid grid-cols-1 gap-4 ${stats.unknown > 0 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <div className="rounded-lg border bg-card p-4 text-center">
          <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
          <div className="text-sm text-muted-foreground">Total Players</div>
        </div>
        <div className="rounded-lg border bg-card p-4 text-center">
          <div className="text-2xl font-bold text-red-500">{stats.horde.toLocaleString()}</div>
          <div className="text-sm text-muted-foreground">Horde</div>
        </div>
        <div className="rounded-lg border bg-card p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{stats.alliance.toLocaleString()}</div>
          <div className="text-sm text-muted-foreground">Alliance</div>
        </div>
        {stats.unknown > 0 && (
          <div className="rounded-lg border bg-card p-4 text-center">
            <div className="text-2xl font-bold text-muted-foreground">{stats.unknown.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Unknown</div>
          </div>
        )}
      </div>

      {/* Faction bar */}
      {knownTotal > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span className="text-red-500 font-medium">Horde — {hordePercent.toFixed(1)}%</span>
            <span className="text-blue-400 font-medium">Alliance — {alliancePercent.toFixed(1)}%</span>
          </div>
          <div className="flex h-4 rounded-full overflow-hidden border">
            <div
              className="bg-red-500/80 transition-all duration-500"
              style={{ width: `${hordePercent}%` }}
            />
            <div
              className="bg-blue-400/80 transition-all duration-500"
              style={{ width: `${alliancePercent}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* By Class */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">By Class</h3>
          <div className="space-y-2">
            {stats.classSorted.map(([cls, count]) => (
              <div key={cls} className="flex items-center gap-3">
                <div className="w-24 text-sm font-medium truncate" style={{ color: getClassColorVar(cls) }}>
                  {cls}
                </div>
                <div className="flex-1 h-6 rounded bg-muted/50 overflow-hidden">
                  <div
                    className="h-full rounded transition-all duration-500"
                    style={{
                      width: `${(count / stats.classMax) * 100}%`,
                      backgroundColor: getClassColorVar(cls),
                      opacity: 0.7,
                    }}
                  />
                </div>
                <div className="w-16 text-sm text-right tabular-nums text-muted-foreground">
                  {count.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* By Race */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">By Race</h3>
          <div className="space-y-2">
            {stats.raceSorted.map(([race, count]) => {
              const faction = raceFaction(race, flavor);
              const barColor = faction === "Horde" ? "rgb(239 68 68 / 0.6)" : faction === "Alliance" ? "rgb(96 165 250 / 0.6)" : "rgb(163 163 163 / 0.6)";
              const textColor = faction === "Horde" ? "text-red-400" : faction === "Alliance" ? "text-blue-400" : "text-muted-foreground";
              return (
                <div key={race} className="flex items-center gap-3">
                  <div className={`w-24 text-sm font-medium truncate ${textColor}`}>
                    {raceName(race, flavor)}
                  </div>
                  <div className="flex-1 h-6 rounded bg-muted/50 overflow-hidden">
                    <div
                      className="h-full rounded transition-all duration-500"
                      style={{
                        width: `${(count / stats.raceMax) * 100}%`,
                        backgroundColor: barColor,
                      }}
                    />
                  </div>
                  <div className="w-16 text-sm text-right tabular-nums text-muted-foreground">
                    {count.toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Class + Race Combinations */}
      {stats.comboMax > 0 && (
        <ComboMatrix stats={stats} flavor={flavor} sortByRace={sortByRace} setSortByRace={setSortByRace} sortByClass={sortByClass} setSortByClass={setSortByClass} />
      )}
    </div>
  );
}

interface ComboStats {
  comboMap: Map<string, number>;
  comboMax: number;
  classNames: string[];
  raceNames: string[];
}

function ComboMatrix({
  stats,
  flavor,
  sortByRace,
  setSortByRace,
  sortByClass,
  setSortByClass,
}: {
  stats: ComboStats;
  flavor: readonly string[];
  sortByRace: string | null;
  setSortByRace: (v: string | null) => void;
  sortByClass: string | null;
  setSortByClass: (v: string | null) => void;
}) {
  // Sort rows (classes) by the selected race column, or default order
  const sortedClassNames = useMemo(() => {
    if (!sortByRace) return stats.classNames;
    return [...stats.classNames].sort((a, b) => {
      const countA = stats.comboMap.get(`${a}|${sortByRace}`) ?? 0;
      const countB = stats.comboMap.get(`${b}|${sortByRace}`) ?? 0;
      return countB - countA;
    });
  }, [stats.classNames, stats.comboMap, sortByRace]);

  // Sort columns (races) by the selected class row, or default order
  const sortedRaceNames = useMemo(() => {
    if (!sortByClass) return stats.raceNames;
    return [...stats.raceNames].sort((a, b) => {
      const countA = stats.comboMap.get(`${sortByClass}|${a}`) ?? 0;
      const countB = stats.comboMap.get(`${sortByClass}|${b}`) ?? 0;
      return countB - countA;
    });
  }, [stats.raceNames, stats.comboMap, sortByClass]);

  const handleRaceClick = (race: string) => {
    setSortByRace(sortByRace === race ? null : race);
  };

  const handleClassClick = (cls: string) => {
    setSortByClass(sortByClass === cls ? null : cls);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Class / Race Combinations</h3>
        {(sortByRace || sortByClass) && (
          <button
            onClick={() => { setSortByRace(null); setSortByClass(null); }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕ Clear sort
          </button>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-muted/30">Class</th>
              {sortedRaceNames.map((race) => {
                const faction = raceFaction(race, flavor);
                const textColor = faction === "Horde" ? "text-red-400" : faction === "Alliance" ? "text-blue-400" : "text-muted-foreground";
                const isActive = sortByRace === race;
                return (
                  <th
                    key={race}
                    onClick={() => handleRaceClick(race)}
                    className={`px-3 py-2 font-medium text-center whitespace-nowrap cursor-pointer select-none transition-colors hover:bg-muted/50 ${textColor} ${isActive ? "bg-muted/60" : ""}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {raceName(race, flavor)}
                      {isActive && <ArrowUpDown className="h-3 w-3" />}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedClassNames.map((cls) => {
              const isActive = sortByClass === cls;
              return (
                <tr key={cls} className={`border-b last:border-b-0 ${isActive ? "bg-muted/20" : ""}`}>
                  <td
                    onClick={() => handleClassClick(cls)}
                    className="px-3 py-2 font-medium whitespace-nowrap sticky left-0 bg-background cursor-pointer select-none hover:bg-muted/30 transition-colors"
                    style={{ color: getClassColorVar(cls) }}
                  >
                    <span className="inline-flex items-center gap-1">
                      {cls}
                      {isActive && <ArrowUpDown className="h-3 w-3" />}
                    </span>
                  </td>
                  {sortedRaceNames.map((race) => {
                    const count = stats.comboMap.get(`${cls}|${race}`) ?? 0;
                    const intensity = count > 0 ? Math.max(0.1, count / stats.comboMax) : 0;
                    const isHighlighted = sortByRace === race || sortByClass === cls;
                    return (
                      <td key={race} className={`px-3 py-2 text-center tabular-nums ${isHighlighted ? "bg-muted/80" : ""}`}>
                        {count > 0 ? (
                          <span
                            className="inline-block min-w-[2.5rem] px-1.5 py-0.5 rounded text-xs font-medium"
                            style={{
                              backgroundColor: `color-mix(in srgb, ${getClassColorVar(cls)} ${Math.round(intensity * 40)}%, transparent)`,
                              color: getClassColorVar(cls),
                            }}
                          >
                            {count.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
