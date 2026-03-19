import type { SimRunResult } from "./useSimRunner";

interface SimResultsPanelProps {
  result: SimRunResult;
}

export function SimResultsPanel({ result }: SimResultsPanelProps) {
  const { results } = result;
  const durationSec = results.durationMs / 1000;

  // Sort breakdown by damage desc
  const breakdown = [...results.spellBreakdown.values()].sort(
    (a, b) => b.totalDmg - a.totalDmg,
  );

  return (
    <div className="space-y-6">
      {/* DPS Summary */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="DPS" value={results.dps.toFixed(1)} />
        <StatCard
          label="Total Damage"
          value={results.totalDamage.toLocaleString()}
        />
        <StatCard label="Duration" value={`${durationSec.toFixed(0)}s`} />
      </div>

      {/* Spell Breakdown Table */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-800/50 text-zinc-400 text-left">
              <th className="px-3 py-2">Ability</th>
              <th className="px-3 py-2 text-right">Damage</th>
              <th className="px-3 py-2 text-right">%</th>
              <th className="px-3 py-2 text-right">DPS</th>
              <th className="px-3 py-2 text-right">Casts</th>
              <th className="px-3 py-2 text-right">Avg Hit</th>
              <th className="px-3 py-2 text-right">Crit %</th>
              <th className="px-3 py-2 text-right">Miss %</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((b) => {
              const totalAttempts = b.hits + b.crits + b.misses + b.ticks;
              const critPct =
                b.hits + b.crits > 0
                  ? ((b.crits / (b.hits + b.crits)) * 100).toFixed(1)
                  : "—";
              const missPct =
                totalAttempts > 0
                  ? ((b.misses / totalAttempts) * 100).toFixed(1)
                  : "—";

              return (
                <tr
                  key={b.spellID}
                  className="border-t border-zinc-800 hover:bg-zinc-800/30"
                >
                  <td className="px-3 py-1.5 font-medium text-zinc-200">
                    {b.name}
                  </td>
                  <td className="px-3 py-1.5 text-right text-zinc-300">
                    {b.totalDmg.toLocaleString()}
                  </td>
                  <td className="px-3 py-1.5 text-right text-zinc-400">
                    {b.dpsPercent.toFixed(1)}%
                  </td>
                  <td className="px-3 py-1.5 text-right text-zinc-300">
                    {b.dps.toFixed(1)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-zinc-400">
                    {b.casts}
                  </td>
                  <td className="px-3 py-1.5 text-right text-zinc-300">
                    {b.avgHit > 0 ? b.avgHit.toFixed(0) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right text-zinc-400">
                    {critPct}%
                  </td>
                  <td className="px-3 py-1.5 text-right text-zinc-400">
                    {missPct}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-center">
      <div className="text-2xl font-bold text-zinc-100">{value}</div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
    </div>
  );
}
