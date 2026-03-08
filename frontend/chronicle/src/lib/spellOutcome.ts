/**
 * AttackOutcome — bitmask of possible hit table results for a spell.
 * Mirrors chrondbc.AttackOutcome from the Go backend.
 *
 * Populated on SpellData.attack_outcome in the proto event stream.
 */

export const AttackOutcomeNone     = 0x00;
export const AttackOutcomeMiss     = 0x01;
export const AttackOutcomeDodge    = 0x02;
export const AttackOutcomeParry    = 0x04;
export const AttackOutcomeBlock    = 0x08;
export const AttackOutcomeResist   = 0x10;  // Full resist
export const AttackOutcomeHit      = 0x20;
export const AttackOutcomeCrit     = 0x40;
export const AttackOutcomeGlancing = 0x80;
export const AttackOutcomeCrushing = 0x100;

/** Check if a specific outcome is possible for a given attack outcome bitmask. */
export function hasOutcome(mask: number, flag: number): boolean {
  return (mask & flag) !== 0;
}
