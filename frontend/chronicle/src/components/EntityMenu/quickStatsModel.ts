import type { GuildSpeedrunRun } from "@/api/typesGenerated";
import { guildHistoryValueIsShown } from "@/pages/GuildHistory/guildHistoryModel";

export function guildChartPoints(runs: readonly GuildSpeedrunRun[], focus: GuildSpeedrunRun | null) {
  return runs.flatMap((run) =>
    guildHistoryValueIsShown(run.duration_ms, "time")
      ? [{ time: Date.parse(run.completion_time), value: run.duration_ms, highlight: run === focus }]
      : [],
  );
}
