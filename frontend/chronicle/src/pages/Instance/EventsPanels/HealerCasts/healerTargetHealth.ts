import type { PlayerLifeTransition } from "../processors/playerLifeState.processor";
import type { StatusEncounter } from "../Status/status.processor";
import {
  STATUS_FUTURE_MILLI,
  STATUS_HISTORY_MILLI,
  snapshotStatusUnit,
  statusUnitRelativeHealthBounds,
  type StatusRelativeHealthBounds,
  type StatusUnitSnapshot,
} from "../Status/statusTimeline";

export function healerTargetHealthSnapshot(
  encounter: StatusEncounter | null,
  targetId: string,
  cursorMilli: number,
  lifeTransitions?: readonly PlayerLifeTransition[],
  bounds?: StatusRelativeHealthBounds,
): StatusUnitSnapshot | null {
  const unit = encounter?.units.get(targetId);
  if (!unit || unit.kind !== "player") return null;

  return snapshotStatusUnit(
    unit,
    cursorMilli,
    STATUS_HISTORY_MILLI,
    STATUS_FUTURE_MILLI,
    bounds ?? statusUnitRelativeHealthBounds(unit, lifeTransitions),
    lifeTransitions,
  );
}
