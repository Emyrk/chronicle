import { describe, it, expect } from "vitest";
import {
  type HitType,
  HitTypeNone,
  HitTypeOffHand,
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
  HitTypeMainHand,
  hasHitType,
  hitTypeName,
  hitTypeNames,
} from "./hittype";

describe("HitType constants", () => {
  it("has correct hex values matching Go constants", () => {
    expect(HitTypeNone).toBe(0x00000000);
    expect(HitTypeOffHand).toBe(0x00000001);
    expect(HitTypeHit).toBe(0x00000002);
    expect(HitTypeCrit).toBe(0x00000004);
    expect(HitTypePartialResist).toBe(0x00000008);
    expect(HitTypeFullResist).toBe(0x00000010);
    expect(HitTypeMiss).toBe(0x00000020);
    expect(HitTypePartialAbsorb).toBe(0x00000040);
    expect(HitTypeFullAbsorb).toBe(0x00000080);
    expect(HitTypeGlancing).toBe(0x00000100);
    expect(HitTypeCrushing).toBe(0x00000200);
    expect(HitTypeEvade).toBe(0x00000400);
    expect(HitTypeDodge).toBe(0x00000800);
    expect(HitTypeParry).toBe(0x00001000);
    expect(HitTypeImmune).toBe(0x00002000);
    expect(HitTypeEnvironment).toBe(0x00004000);
    expect(HitTypeDeflect).toBe(0x00008000);
    expect(HitTypeInterrupt).toBe(0x00010000);
    expect(HitTypePartialBlock).toBe(0x00020000);
    expect(HitTypeFullBlock).toBe(0x00040000);
    expect(HitTypeSplit).toBe(0x00080000);
    expect(HitTypeReflect).toBe(0x00100000);
    expect(HitTypePeriodic).toBe(0x00200000);
    expect(HitTypeMainHand).toBe(0x00400000);
  });

  it("constants are powers of 2 (single bit flags)", () => {
    const flags = [
      HitTypeOffHand,
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
      HitTypeMainHand,
    ];

    for (const flag of flags) {
      // A power of 2 has exactly one bit set: (n & (n-1)) === 0
      expect(flag & (flag - 1)).toBe(0);
    }
  });
});

describe("hasHitType", () => {
  it("returns true when flag is present", () => {
    const ht: HitType = HitTypeCrit | HitTypePartialResist;
    expect(hasHitType(ht, HitTypeCrit)).toBe(true);
    expect(hasHitType(ht, HitTypePartialResist)).toBe(true);
  });

  it("returns false when flag is not present", () => {
    const ht: HitType = HitTypeCrit | HitTypePartialResist;
    expect(hasHitType(ht, HitTypeMiss)).toBe(false);
    expect(hasHitType(ht, HitTypeHit)).toBe(false);
    expect(hasHitType(ht, HitTypeNone)).toBe(false);
  });

  it("works with single flag", () => {
    expect(hasHitType(HitTypeCrit, HitTypeCrit)).toBe(true);
    expect(hasHitType(HitTypeCrit, HitTypeMiss)).toBe(false);
  });

  it("works with HitTypeNone", () => {
    expect(hasHitType(HitTypeNone, HitTypeCrit)).toBe(false);
    expect(hasHitType(HitTypeNone, HitTypeNone)).toBe(false);
  });

  it("handles complex combinations", () => {
    // Crit + partial resist + off-hand
    const ht: HitType = HitTypeCrit | HitTypePartialResist | HitTypeOffHand;
    expect(hasHitType(ht, HitTypeCrit)).toBe(true);
    expect(hasHitType(ht, HitTypePartialResist)).toBe(true);
    expect(hasHitType(ht, HitTypeOffHand)).toBe(true);
    expect(hasHitType(ht, HitTypeHit)).toBe(false);
  });
});

describe("hitTypeName", () => {
  const nameTests: [HitType, string][] = [
    [HitTypeNone, "None"],
    [HitTypeOffHand, "Off-Hand"],
    [HitTypeHit, "Hit"],
    [HitTypeCrit, "Crit"],
    [HitTypePartialResist, "Partial Resist"],
    [HitTypeFullResist, "Full Resist"],
    [HitTypeMiss, "Miss"],
    [HitTypePartialAbsorb, "Partial Absorb"],
    [HitTypeFullAbsorb, "Full Absorb"],
    [HitTypeGlancing, "Glancing"],
    [HitTypeCrushing, "Crushing"],
    [HitTypeEvade, "Evade"],
    [HitTypeDodge, "Dodge"],
    [HitTypeParry, "Parry"],
    [HitTypeImmune, "Immune"],
    [HitTypeEnvironment, "Environment"],
    [HitTypeDeflect, "Deflect"],
    [HitTypeInterrupt, "Interrupt"],
    [HitTypePartialBlock, "Partial Block"],
    [HitTypeFullBlock, "Full Block"],
    [HitTypeSplit, "Split"],
    [HitTypeReflect, "Reflect"],
    [HitTypePeriodic, "Periodic"],
    [HitTypeMainHand, "Main-Hand"],
  ];

  it.each(nameTests)("hitTypeName(0x%s) returns %s", (flag, expectedName) => {
    expect(hitTypeName(flag)).toBe(expectedName);
  });

  it("returns Unknown for unrecognized flags", () => {
    const unknownFlag = 0x80000000;
    expect(hitTypeName(unknownFlag)).toBe("Unknown(0x80000000)");
  });
});

describe("hitTypeNames", () => {
  it("returns ['None'] for HitTypeNone", () => {
    expect(hitTypeNames(HitTypeNone)).toEqual(["None"]);
  });

  it("returns single flag name", () => {
    expect(hitTypeNames(HitTypeCrit)).toEqual(["Crit"]);
    expect(hitTypeNames(HitTypeMiss)).toEqual(["Miss"]);
  });

  it("returns multiple flag names in order", () => {
    const ht: HitType = HitTypeCrit | HitTypePartialResist;
    expect(hitTypeNames(ht)).toEqual(["Crit", "Partial Resist"]);
  });

  it("handles off-hand crit with partial resist", () => {
    const ht: HitType = HitTypeOffHand | HitTypeCrit | HitTypePartialResist;
    expect(hitTypeNames(ht)).toEqual(["Off-Hand", "Crit", "Partial Resist"]);
  });

  it("handles main-hand crits", () => {
    const ht: HitType = HitTypeMainHand | HitTypeCrit;
    expect(hitTypeNames(ht)).toEqual(["Main-Hand", "Crit"]);
  });

  it("handles periodic damage", () => {
    const ht: HitType = HitTypeHit | HitTypePeriodic;
    expect(hitTypeNames(ht)).toEqual(["Hit", "Periodic"]);
  });
});
