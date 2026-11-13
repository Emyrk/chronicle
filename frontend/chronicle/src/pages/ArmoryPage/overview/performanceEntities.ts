import type { CharacterPerformanceRun } from "@/api/typesGenerated";
import type { EntityRef } from "@/components/EntityMenu/entity";

export function performanceRunEntity(
  run: CharacterPerformanceRun,
  instanceName: string,
  difficultyName?: string,
  maxPlayers?: number,
): Extract<EntityRef, { kind: "raid" }> {
  return {
    kind: "raid",
    id: run.representative_instance_id,
    name: instanceName,
    difficultyName,
    maxPlayers,
    logId: run.representative_instance_id,
    clearMs: Math.round(run.duration_secs * 1000),
    startTime: run.started_at,
  };
}
