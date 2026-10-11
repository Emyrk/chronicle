// hittype.ts
// TypeScript port of the Go HitType bitmask constants.
// HitTypes can be combined (e.g., a critical hit that was partially resisted).

export type HitType = number;

// HitType constants - these are bitmask flags that can be combined
export const HitTypeNone: HitType = 0x00000000;
export const HitTypeOffHand: HitType = 0x00000001;
export const HitTypeHit: HitType = 0x00000002;
export const HitTypeCrit: HitType = 0x00000004;
export const HitTypePartialResist: HitType = 0x00000008;
export const HitTypeFullResist: HitType = 0x00000010;
export const HitTypeMiss: HitType = 0x00000020;
export const HitTypePartialAbsorb: HitType = 0x00000040;
export const HitTypeFullAbsorb: HitType = 0x00000080;
export const HitTypeGlancing: HitType = 0x00000100;
export const HitTypeCrushing: HitType = 0x00000200;
export const HitTypeEvade: HitType = 0x00000400;
export const HitTypeDodge: HitType = 0x00000800;
export const HitTypeParry: HitType = 0x00001000;
export const HitTypeImmune: HitType = 0x00002000;
export const HitTypeEnvironment: HitType = 0x00004000;
export const HitTypeDeflect: HitType = 0x00008000;
export const HitTypeInterrupt: HitType = 0x00010000;
export const HitTypePartialBlock: HitType = 0x00020000;
export const HitTypeFullBlock: HitType = 0x00040000;
export const HitTypeSplit: HitType = 0x00080000;
export const HitTypeReflect: HitType = 0x00100000;
export const HitTypePeriodic: HitType = 0x00200000;
export const HitTypeMainHand: HitType = 0x00400000;

/**
 * Check if a HitType value has a specific flag set.
 * @param hitType - The combined HitType value to check
 * @param flag - The flag to check for
 * @returns true if the flag is present in hitType
 *
 * @example
 * const ht = HitTypeCrit | HitTypePartialResist;
 * hasHitType(ht, HitTypeCrit); // true
 * hasHitType(ht, HitTypeMiss); // false
 */
export function hasHitType(hitType: HitType, flag: HitType): boolean {
  return (hitType & flag) !== 0;
}

/**
 * Human-readable name for a single HitType flag.
 * For combined flags, use hitTypeNames() instead.
 */
export function hitTypeName(flag: HitType): string {
  switch (flag) {
    case HitTypeNone:
      return "None";
    case HitTypeOffHand:
      return "Off-Hand";
    case HitTypeHit:
      return "Hit";
    case HitTypeCrit:
      return "Crit";
    case HitTypePartialResist:
      return "Partial Resist";
    case HitTypeFullResist:
      return "Full Resist";
    case HitTypeMiss:
      return "Miss";
    case HitTypePartialAbsorb:
      return "Partial Absorb";
    case HitTypeFullAbsorb:
      return "Full Absorb";
    case HitTypeGlancing:
      return "Glancing";
    case HitTypeCrushing:
      return "Crushing";
    case HitTypeEvade:
      return "Evade";
    case HitTypeDodge:
      return "Dodge";
    case HitTypeParry:
      return "Parry";
    case HitTypeImmune:
      return "Immune";
    case HitTypeEnvironment:
      return "Environment";
    case HitTypeDeflect:
      return "Deflect";
    case HitTypeInterrupt:
      return "Interrupt";
    case HitTypePartialBlock:
      return "Partial Block";
    case HitTypeFullBlock:
      return "Full Block";
    case HitTypeSplit:
      return "Split";
    case HitTypeReflect:
      return "Reflect";
    case HitTypePeriodic:
      return "Periodic";
    case HitTypeMainHand:
      return "Main-Hand";
    default:
      return `Unknown(0x${flag.toString(16).toUpperCase()})`;
  }
}

// All HitType flags for iteration
const allHitTypeFlags: HitType[] = [
  HitTypeOffHand,
  HitTypeMainHand,
  HitTypeHit,
  HitTypeCrit,
  HitTypePartialResist,
  HitTypeFullResist,
  HitTypeMiss,
  HitTypePartialAbsorb,
  HitTypeFullAbsorb,
  HitTypeGlancing,
  HitTypeCrushing,
  HitTypeEvade,
  HitTypeDodge,
  HitTypeParry,
  HitTypeImmune,
  HitTypeEnvironment,
  HitTypeDeflect,
  HitTypeInterrupt,
  HitTypePartialBlock,
  HitTypeFullBlock,
  HitTypeSplit,
  HitTypeReflect,
  HitTypePeriodic,
];

/**
 * Get all flag names present in a combined HitType value.
 * @param hitType - The combined HitType value
 * @returns Array of human-readable flag names
 *
 * @example
 * const ht = HitTypeCrit | HitTypePartialResist;
 * hitTypeNames(ht); // ["Crit", "Partial Resist"]
 */
export function hitTypeNames(hitType: HitType): string[] {
  if (hitType === HitTypeNone) {
    return ["None"];
  }

  const names: string[] = [];
  for (const flag of allHitTypeFlags) {
    if (hasHitType(hitType, flag)) {
      names.push(hitTypeName(flag));
    }
  }
  return names;
}
