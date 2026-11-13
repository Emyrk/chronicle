import { CLASS_DISPLAY } from "@/pages/Rankings/classDisplay";
import type { CharacterPerformanceRun } from "@/api/typesGenerated";
import { entityAttributes, specEntity, type EntityRef } from "@/components/EntityMenu/entity";

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
    // Selected encounter combat duration is not a ranked full-clear time.
    startTime: run.started_at,
  };
}

/** Mixed/unknown filters are not actual specializations. */
export function performanceSpecAttributes(className: string, spec?: string | null, subSpec?: string | null): Partial<ReturnType<typeof entityAttributes>> {
  if (!spec || spec === "Mixed" || spec === "Unknown") return {};
  const actualSubSpec = subSpec && subSpec !== "Mixed" && subSpec !== "Unknown" ? subSpec : undefined;
  return entityAttributes(specEntity(className, CLASS_DISPLAY[className] ?? className, spec, actualSubSpec));
}
