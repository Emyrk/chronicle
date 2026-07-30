import type { AllActivityState, RawDebugEvent } from "./processors";

export function collectAllActivityEvents(
  rawEventsByStream: AllActivityState["rawEventsByStream"],
): RawDebugEvent[] {
  return [
    ...rawEventsByStream.damage,
    ...rawEventsByStream.heal,
    ...rawEventsByStream.resource_change,
    ...rawEventsByStream.cast,
    ...rawEventsByStream.aura,
    ...rawEventsByStream.ressurection,
    ...rawEventsByStream.slain,
    ...rawEventsByStream.spell_go,
    ...rawEventsByStream.spell_start,
    ...rawEventsByStream.spell_fail,
    ...rawEventsByStream.aura_cast,
    ...rawEventsByStream.extra_attack,
    ...rawEventsByStream.unit_classification,
    ...rawEventsByStream.combatant_info,
    ...rawEventsByStream.dispel,
    ...rawEventsByStream.consume,
  ];
}
