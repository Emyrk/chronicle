// SpellDamageType bitmask constants (mirrors Chronicle's chrondbc.SpellDamageType).
export const SpellDamageType = {
  Unknown: 0x00,
  Direct: 0x01,
  Periodic: 0x02,
  PeriodicTrigger: 0x04,
  ActiveDebuff: 0x08,
  NoEngageCombat: 0x10,
} as const;

export function getDamageTypeLabels(damageType: number): string[] {
  const labels: string[] = [];
  if (damageType & SpellDamageType.Direct) labels.push("Direct");
  if (damageType & SpellDamageType.Periodic) labels.push("Periodic");
  if (damageType & SpellDamageType.PeriodicTrigger) labels.push("Periodic Trigger");
  if (damageType & SpellDamageType.ActiveDebuff) labels.push("Active Debuff");
  if (damageType & SpellDamageType.NoEngageCombat) labels.push("No Engage Combat");
  return labels;
}

// AttackOutcome bitmask constants (mirrors chrondbc.AttackOutcome).
export const AttackOutcome = {
  None: 0x00,
  Miss: 0x01,
  Dodge: 0x02,
  Parry: 0x04,
  Block: 0x08,
  Resist: 0x10,
  Hit: 0x20,
  Crit: 0x40,
  Glancing: 0x80,
  Crushing: 0x100,
} as const;

export function getAttackOutcomeLabels(outcome: number): string[] {
  const labels: string[] = [];
  if (outcome & AttackOutcome.Miss) labels.push("Miss");
  if (outcome & AttackOutcome.Dodge) labels.push("Dodge");
  if (outcome & AttackOutcome.Parry) labels.push("Parry");
  if (outcome & AttackOutcome.Block) labels.push("Block");
  if (outcome & AttackOutcome.Resist) labels.push("Resist");
  if (outcome & AttackOutcome.Hit) labels.push("Hit");
  if (outcome & AttackOutcome.Crit) labels.push("Crit");
  if (outcome & AttackOutcome.Glancing) labels.push("Glancing");
  if (outcome & AttackOutcome.Crushing) labels.push("Crushing");
  return labels;
}
