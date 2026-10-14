export interface SpellTooltipContext {
  playerLevel?: number;
  attackPower?: number;
  bonusHealing?: number;
  spirit?: number;
  shadowSpellPower?: number;
  armor?: number;
  holySpellPower?: number;
  gender?: "male" | "female";
  knownSpellIds?: ReadonlySet<number>;
  /** Auras active on the unit whose runtime tooltip is being rendered. */
  activeAuraIds?: ReadonlySet<number>;
  /** Runtime aura effect values used by $w1, $w2, and so on. */
  auraEffectValues?: readonly number[];
}

export type SpellTooltipNumericContextField = Exclude<
  keyof SpellTooltipContext,
  "gender" | "knownSpellIds" | "activeAuraIds" | "auraEffectValues"
>;

export const SPELL_TOOLTIP_CONTEXT_VARIABLES: Readonly<
  Record<string, SpellTooltipNumericContextField>
> = {
  PL: "playerLevel",
  AP: "attackPower",
  BH: "bonusHealing",
  SPI: "spirit",
  SPS: "shadowSpellPower",
  AR: "armor",
  SPH: "holySpellPower",
};

export function normalizeSpellTooltipContext(
  contextOrLevel?: SpellTooltipContext | number,
): SpellTooltipContext {
  return typeof contextOrLevel === "number"
    ? { playerLevel: contextOrLevel }
    : (contextOrLevel ?? {});
}
